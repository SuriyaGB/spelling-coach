import { readFileSync } from "node:fs";
import { importForeignOriginWords } from "../app/foreignOriginImport.js";
import { getBaseWordByText } from "../app/wordCatalog.js";

type InputEntry = {
  word: string;
  origin: string;
};

function normalizeKey(entry: { word: string; origin: string }): string {
  return `${entry.origin.trim().toLowerCase()}|${entry.word.trim().toLowerCase()}`;
}

async function main() {
  const inputPath =
    process.argv[2] ?? "/Users/pavithra/Downloads/word_list_spanish_italian_refined.json";

  const raw = readFileSync(inputPath, "utf8");
  const entries = JSON.parse(raw) as InputEntry[];

  const validEntries = entries
    .map((entry) => ({
      word: entry.word?.trim() ?? "",
      origin: entry.origin?.trim() ?? "",
    }))
    .filter((entry) => entry.word && entry.origin);

  const requestedByOrigin = new Map<string, number>();
  for (const entry of validEntries) {
    requestedByOrigin.set(
      entry.origin,
      (requestedByOrigin.get(entry.origin) ?? 0) + 1,
    );
  }

  const reusedFromBase = validEntries.filter((entry) => !!getBaseWordByText(entry.word));

  const result = await importForeignOriginWords(
    {
      entries: validEntries,
      overwriteOrigin: true,
    },
    {},
  );

  const returnedByKey = new Map(
    result.words.map((word) => [normalizeKey({ word: word.word, origin: word.origin }), word]),
  );

  const missingEntries = validEntries.filter(
    (entry) => !returnedByKey.has(normalizeKey(entry)),
  );

  const invalidMetadata = validEntries
    .map((entry) => {
      const word = returnedByKey.get(normalizeKey(entry));
      if (!word) {
        return null;
      }
      const definition = word.definition?.trim() ?? "";
      const example = word.example_sentence?.trim() ?? "";
      if (!definition || !example) {
        return {
          word: entry.word,
          origin: entry.origin,
          definitionPresent: Boolean(definition),
          exampleSentencePresent: Boolean(example),
        };
      }
      return null;
    })
    .filter(Boolean);

  const workedOnPerOrigin = Array.from(requestedByOrigin.entries())
    .map(([origin, requested]) => {
      const imported = result.words.filter(
        (word) => word.origin.trim().toLowerCase() === origin.trim().toLowerCase(),
      ).length;
      const missing = missingEntries.filter(
        (entry) => entry.origin.trim().toLowerCase() === origin.trim().toLowerCase(),
      ).length;

      return {
        origin,
        requested,
        imported,
        missing,
      };
    })
    .sort((a, b) => a.origin.localeCompare(b.origin));

  const report = {
    inputPath,
    totalRequested: validEntries.length,
    totalImported: result.importedCount,
    skippedExistingCount: result.skippedExistingCount,
    reusedFromBaseCount: reusedFromBase.length,
    workedOnPerOrigin,
    missingDefinitionOrExampleCount: invalidMetadata.length,
    missingDefinitionOrExample: invalidMetadata,
    missingEntriesCount: missingEntries.length,
    missingEntries,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
