import { z } from "zod";
import {
  buildDirectRuntimeSystemPrompt,
  createDirectSpellingCoachModel,
  type DirectModelLike,
} from "./directModel.js";
import {
  createForeignOriginWordList,
  getBaseWordByText,
  getForeignOriginWordListByOrigin,
  loadForeignOriginWordLists,
  saveForeignOriginWordLists,
  type ForeignOriginWordList,
  type WordEntry,
} from "./wordCatalog.js";

const ForeignWordEntryInputSchema = z.object({
  word: z.string().min(1),
  origin: z.string().min(1),
});

export const ForeignOriginImportRequestSchema = z
  .object({
    entries: z.array(ForeignWordEntryInputSchema).min(1),
    overwriteOrigin: z.boolean().optional(),
  })
  .strict();

const GeneratedForeignWordMetadataSchema = z.object({
  word: z.string(),
  origin: z.string(),
  definition: z.string(),
  exampleSentence: z.string(),
  partOfSpeech: z.string(),
});

const GeneratedForeignWordMetadataListSchema = z.object({
  entries: z.array(GeneratedForeignWordMetadataSchema),
});

type GeneratedForeignWordMetadata = z.infer<typeof GeneratedForeignWordMetadataSchema>;

export type ForeignOriginImportRequest = z.infer<
  typeof ForeignOriginImportRequestSchema
>;

export type ImportForeignOriginWordsResult = {
  origins: Array<{
    origin: string;
    wordCount: number;
  }>;
  importedCount: number;
  skippedExistingCount: number;
  words: WordEntry[];
};

export type GenerateForeignWordMetadataFn = (
  entries: Array<{ word: string; origin: string }>,
) => Promise<GeneratedForeignWordMetadata[]>;

export type ImportForeignOriginWordsOptions = {
  model?: string | object;
  generateMetadata?: GenerateForeignWordMetadataFn;
};

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          (part as { type?: unknown }).type === "text" &&
          "text" in part
        ) {
          return String((part as { text: unknown }).text);
        }

        return "";
      })
      .join("");
  }

  return "";
}

function extractAssistantPayload(result: unknown): string {
  if (typeof result === "string") {
    return result.trim();
  }

  if (result && typeof result === "object") {
    const maybeContent = (result as { content?: unknown }).content;
    if (maybeContent !== undefined) {
      return extractTextContent(maybeContent).trim();
    }

    const messages = (result as { messages?: unknown }).messages;
    if (Array.isArray(messages) && messages.length > 0) {
      const lastMessage = messages[messages.length - 1] as { content?: unknown };
      return extractTextContent(lastMessage?.content).trim();
    }
  }

  throw new Error("Import response did not contain assistant text content.");
}

function parseStrictJson(payload: string): unknown {
  const trimmed = payload.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    throw new Error("Import output must be a single JSON object with no wrapper text.");
  }

  return JSON.parse(trimmed);
}

function normalizeForeignEntries(
  entries: Array<{ word: string; origin: string }>,
): Array<{ word: string; origin: string }> {
  const deduped = new Map<string, { word: string; origin: string }>();

  for (const entry of entries) {
    const word = entry.word.trim();
    const origin = entry.origin.trim();
    if (!word || !origin) {
      continue;
    }

    deduped.set(`${origin.toLowerCase()}|${word.toLowerCase()}`, { word, origin });
  }

  return Array.from(deduped.values());
}

function toWordEntry(metadata: GeneratedForeignWordMetadata): WordEntry {
  return {
    word: metadata.word,
    level: "foreign",
    grade_band: "foreign",
    difficulty: "foreign",
    origin: metadata.origin,
    definition: metadata.definition,
    example_sentence: metadata.exampleSentence,
    patterns: [],
    common_mistakes: [],
    coach_tip: "",
    part_of_speech: metadata.partOfSpeech,
  };
}

function buildForeignOriginImportPrompt(
  entries: Array<{ word: string; origin: string }>,
): string {
  return [
    "Generate child-friendly metadata for foreign-origin spelling words.",
    "Return one JSON object only.",
    "Do not add markdown or explanation.",
    "For each requested entry, generate:",
    "- definition",
    "- exampleSentence",
    "- partOfSpeech",
    "Requirements:",
    "- Keep the origin exactly as provided for each entry.",
    "- Definitions must be concise and clear for children.",
    "- Example sentences must use the word naturally.",
    "- Preserve original spelling and casing of each word.",
    "- Include exactly one output entry for each requested input entry.",
    "Output schema:",
    JSON.stringify(
      {
        entries: [
          {
            word: "string",
            origin: "string",
            definition: "string",
            exampleSentence: "string",
            partOfSpeech: "string",
          },
        ],
      },
      null,
      2,
    ),
    "Requested entries:",
    JSON.stringify(entries, null, 2),
  ].join("\n\n");
}

async function generateForeignWordMetadataWithModel(
  entries: Array<{ word: string; origin: string }>,
  model?: string | object,
): Promise<GeneratedForeignWordMetadata[]> {
  const directModel: DirectModelLike = await createDirectSpellingCoachModel({
    model,
  });
  const response = await directModel.invoke([
    {
      role: "system",
      content: `${buildDirectRuntimeSystemPrompt()}

You are helping generate metadata for foreign-origin spelling words.
Focus only on accurate word metadata generation.`,
    },
    {
      role: "user",
      content: buildForeignOriginImportPrompt(entries),
    },
  ]);

  const payload = extractAssistantPayload(response);
  const parsed = parseStrictJson(payload);
  return GeneratedForeignWordMetadataListSchema.parse(parsed).entries;
}

function toOriginSummary(list: ForeignOriginWordList) {
  return {
    origin: list.origin,
    wordCount: list.words.length,
  };
}

export async function importForeignOriginWords(
  request: ForeignOriginImportRequest,
  options: ImportForeignOriginWordsOptions = {},
): Promise<ImportForeignOriginWordsResult> {
  const parsedRequest = ForeignOriginImportRequestSchema.parse(request);
  const normalizedEntries = normalizeForeignEntries(parsedRequest.entries);

  if (normalizedEntries.length === 0) {
    throw new Error("At least one foreign-origin word entry is required.");
  }

  const allLists = loadForeignOriginWordLists();
  const byOrigin = new Map<string, Array<{ word: string; origin: string }>>();
  for (const entry of normalizedEntries) {
    const key = entry.origin.trim().toLowerCase();
    const current = byOrigin.get(key) ?? [];
    current.push(entry);
    byOrigin.set(key, current);
  }

  const importedWords: WordEntry[] = [];
  let skippedExistingCount = 0;
  const updatedLists = [...allLists];

  for (const [originKey, originEntries] of byOrigin.entries()) {
    const requestedOrigin = originEntries[0]!.origin;
    const existingList = getForeignOriginWordListByOrigin(requestedOrigin);
    const existingByWord = new Map(
      (existingList?.words ?? []).map((entry) => [entry.word.toLowerCase(), entry]),
    );

    const entriesToProcess =
      parsedRequest.overwriteOrigin || !existingList
        ? originEntries
        : originEntries.filter((entry) => !existingByWord.has(entry.word.toLowerCase()));

    skippedExistingCount += originEntries.length - entriesToProcess.length;

    const reusedEntries: WordEntry[] = [];
    const entriesToGenerate: Array<{ word: string; origin: string }> = [];

    for (const entry of entriesToProcess) {
      const baseEntry = getBaseWordByText(entry.word);
      if (baseEntry) {
        reusedEntries.push({
          ...baseEntry,
          level: "foreign",
          grade_band: "foreign",
          difficulty: "foreign",
          origin: entry.origin,
        });
      } else {
        entriesToGenerate.push(entry);
      }
    }

    const generatedMetadata = entriesToGenerate.length === 0
      ? []
      : await (options.generateMetadata ?? ((items) =>
          generateForeignWordMetadataWithModel(items, options.model)))(
          entriesToGenerate,
        );

    const generatedEntries = generatedMetadata.map((entry) => toWordEntry(entry));
    const importedForOrigin = [...reusedEntries, ...generatedEntries];
    importedWords.push(...importedForOrigin);

    const mergedWords =
      parsedRequest.overwriteOrigin || !existingList
        ? importedForOrigin
        : [
            ...existingList.words,
            ...importedForOrigin.filter(
              (entry) => !existingByWord.has(entry.word.toLowerCase()),
            ),
          ];

    const nextList = existingList
      ? {
          ...existingList,
          words: mergedWords,
        }
      : createForeignOriginWordList(requestedOrigin, mergedWords);

    const existingIndex = updatedLists.findIndex(
      (list) => list.origin.trim().toLowerCase() === originKey,
    );
    if (existingIndex >= 0) {
      updatedLists[existingIndex] = nextList;
    } else {
      updatedLists.push(nextList);
    }
  }

  saveForeignOriginWordLists(updatedLists);

  return {
    origins: updatedLists.map(toOriginSummary),
    importedCount: importedWords.length,
    skippedExistingCount,
    words: importedWords,
  };
}
