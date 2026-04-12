import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const WordEntrySchema = z.object({
  word: z.string(),
  level: z.enum(["1", "2", "3", "custom"]),
  grade_band: z.string(),
  difficulty: z.string(),
  origin: z.string(),
  definition: z.string(),
  example_sentence: z.string(),
  patterns: z.array(z.string()),
  common_mistakes: z.array(z.string()),
  coach_tip: z.string(),
  part_of_speech: z.string(),
});

const WordCatalogSchema = z.array(WordEntrySchema);

const CustomWordListSchema = z.object({
  id: z.string(),
  name: z.string(),
  words: z.array(WordEntrySchema),
});

const CustomWordListsSchema = z.array(CustomWordListSchema);

export type WordEntry = z.infer<typeof WordEntrySchema>;
export type SupportedLevel = "1" | "2" | "3";
export type WordLevel = z.infer<typeof WordEntrySchema>["level"];
export type CustomWordList = z.infer<typeof CustomWordListSchema>;
type CustomListRotationState = {
  order: string[];
  nextIndex: number;
  signature: string;
};

let wordCatalogCache: WordEntry[] | null = null;
let customWordListsCache: CustomWordList[] | null = null;
let customListRotationCache = new Map<string, CustomListRotationState>();

const DEFAULT_WORD_CATALOG_FILE = "words.generated.json";
const CUSTOM_WORD_LISTS_FILE = "words.custom.generated.json";
const REFERENCE_DATA_DIR = join(process.cwd(), "reference_data");

function readWordCatalogFile(fileName: string): WordEntry[] {
  const absolutePath = join(REFERENCE_DATA_DIR, fileName);
  if (!existsSync(absolutePath)) {
    return [];
  }

  const content = readFileSync(absolutePath, "utf8");
  return WordCatalogSchema.parse(JSON.parse(content));
}

function readCustomWordListsFile(): CustomWordList[] {
  const absolutePath = join(REFERENCE_DATA_DIR, CUSTOM_WORD_LISTS_FILE);
  if (!existsSync(absolutePath)) {
    return [];
  }

  const content = readFileSync(absolutePath, "utf8");
  return CustomWordListsSchema.parse(JSON.parse(content));
}

export function loadCustomWordLists(): CustomWordList[] {
  if (customWordListsCache) {
    return customWordListsCache;
  }

  customWordListsCache = readCustomWordListsFile();
  return customWordListsCache;
}

export function saveCustomWordLists(lists: CustomWordList[]): void {
  mkdirSync(REFERENCE_DATA_DIR, { recursive: true });
  const parsed = CustomWordListsSchema.parse(lists);
  writeFileSync(
    join(REFERENCE_DATA_DIR, CUSTOM_WORD_LISTS_FILE),
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8",
  );
  invalidateWordCatalogCache();
}

export function invalidateWordCatalogCache(): void {
  wordCatalogCache = null;
  customWordListsCache = null;
  customListRotationCache = new Map();
}

function shuffle<T>(values: T[]): T[] {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex]!;
    shuffled[swapIndex] = current!;
  }

  return shuffled;
}

function getCustomListSignature(words: WordEntry[]): string {
  return words.map((entry) => entry.word.toLowerCase()).join("|");
}

function pickNextCustomListWord(
  listId: string,
  words: WordEntry[],
  excludedWords: Set<string>,
): WordEntry {
  if (words.length === 0) {
    throw new Error(`No words available for custom list ${listId}.`);
  }

  const signature = getCustomListSignature(words);
  const existing = customListRotationCache.get(listId);
  const activeState =
    existing && existing.signature === signature
      ? existing
      : {
          order: shuffle(words.map((entry) => entry.word.toLowerCase())),
          nextIndex: 0,
          signature,
        };

  customListRotationCache.set(listId, activeState);

  for (let attempts = 0; attempts < activeState.order.length; attempts += 1) {
    const wordKey = activeState.order[activeState.nextIndex];
    activeState.nextIndex = (activeState.nextIndex + 1) % activeState.order.length;
    if (!wordKey || excludedWords.has(wordKey)) {
      continue;
    }

    const match = words.find((entry) => entry.word.toLowerCase() === wordKey);
    if (match) {
      return match;
    }
  }

  const fallback = words.find(
    (entry) => !excludedWords.has(entry.word.toLowerCase()),
  );
  return fallback ?? words[0]!;
}

export function loadWordCatalog(): WordEntry[] {
  if (wordCatalogCache) {
    return wordCatalogCache;
  }

  const baseCatalog = readWordCatalogFile(DEFAULT_WORD_CATALOG_FILE);
  const mergedCatalog = new Map<string, WordEntry>();

  for (const entry of baseCatalog) {
    mergedCatalog.set(entry.word.toLowerCase(), entry);
  }

  for (const list of loadCustomWordLists()) {
    for (const entry of list.words) {
      mergedCatalog.set(entry.word.toLowerCase(), entry);
    }
  }

  wordCatalogCache = Array.from(mergedCatalog.values());
  return wordCatalogCache;
}

export function listCustomWordLists(): Array<{
  id: string;
  name: string;
  wordCount: number;
}> {
  return loadCustomWordLists().map((list) => ({
    id: list.id,
    name: list.name,
    wordCount: list.words.length,
  }));
}

export function getCustomWordListById(listId: string): CustomWordList | undefined {
  return loadCustomWordLists().find((list) => list.id === listId);
}

export function createCustomWordList(
  name: string,
  words: WordEntry[],
): CustomWordList {
  return {
    id: randomUUID(),
    name,
    words,
  };
}

export function getWordsByLevel(level: SupportedLevel): WordEntry[] {
  return readWordCatalogFile(DEFAULT_WORD_CATALOG_FILE).filter(
    (entry) => entry.level === level,
  );
}

export function getBaseWordByText(word: string): WordEntry | undefined {
  const normalizedWord = word.toLowerCase();
  return readWordCatalogFile(DEFAULT_WORD_CATALOG_FILE).find(
    (entry) => entry.word.toLowerCase() === normalizedWord,
  );
}

export function getWordByText(word: string): WordEntry | undefined {
  const normalizedWord = word.toLowerCase();
  return loadWordCatalog().find(
    (entry) => entry.word.toLowerCase() === normalizedWord,
  );
}

export function pickNextWord(
  level: SupportedLevel | undefined,
  excludedWords: string[] = [],
  customListId?: string,
): WordEntry {
  const excluded = new Set(excludedWords.map((word) => word.toLowerCase()));
  const customListWords = customListId
    ? getCustomWordListById(customListId)?.words ?? []
    : [];
  if (customListId) {
    return pickNextCustomListWord(customListId, customListWords, excluded);
  }

  const poolSource = level ? getWordsByLevel(level) : [];
  const candidates = poolSource.filter(
    (entry) => !excluded.has(entry.word.toLowerCase()),
  );

  const pool = candidates.length > 0 ? candidates : poolSource;
  if (pool.length === 0) {
    throw new Error(
      customListId
        ? `No words available for custom list ${customListId}.`
        : `No words available for level ${level}.`,
    );
  }

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}
