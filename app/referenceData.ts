import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SpellingCoachInput } from "./schemas.js";

type ReferenceRow = {
  root: string;
  meaning: string;
  origin: string;
  sampleWords: string;
};

type SpellingRuleRow = {
  ruleLabel: string;
  ruleType: string;
  patternRole: string;
  matcherScope: string;
  patternMatchType: string;
  pattern: string;
  description: string;
  examples: string;
  exceptions: string;
  appliesWhen: string;
};

export type MatchedSpellingRule = {
  ruleLabel: string;
  description: string;
  patternRole: string;
  patternMatchType: string;
  pattern: string;
};

export type ReferenceHint = {
  root: string;
  matchedForm: string;
  meaning: string;
  origin: string;
  role: "prefix" | "suffix_family" | "root";
  source:
    | "roots_csv"
    | "prefixes_csv"
    | "suffixes_csv"
    | "numeric_prefixes_csv"
    | "prefix_list_csv"
    | "suffix_list_csv";
};

const RULE_SHORTLIST_LIMIT = 16;

const REFERENCE_FILES = [
  "greek_latin_roots_A-G_clean.csv",
  "greek_latin_roots_H-O_clean.csv",
  "greek_latin_roots_P-Z_clean.csv",
];
const PREFIX_FILE = "prefixes.csv";
const SUFFIX_FILE = "suffixes.csv";
const NUMERIC_PREFIX_FILE = "numeric_prefixes.csv";
const PREFIX_LIST_FILE = "prefix_list.csv";
const SUFFIX_LIST_FILE = "suffix_list.csv";
const SPELLING_RULES_FILE = "spelling_rules_full_coverage.csv";

let referenceRowsCache: ReferenceRow[] | null = null;
let spellingRuleRowsCache: SpellingRuleRow[] | null = null;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function loadReferenceRows(): ReferenceRow[] {
  if (referenceRowsCache) {
    return referenceRowsCache;
  }

  const allRows: ReferenceRow[] = [];

  for (const fileName of REFERENCE_FILES) {
    const absolutePath = join(process.cwd(), "reference_data", fileName);
    const content = readFileSync(absolutePath, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);

    for (const line of lines.slice(1)) {
      const [root = "", meaning = "", origin = "", sampleWords = ""] =
        parseCsvLine(line);

      if (!root || !meaning) {
        continue;
      }

      allRows.push({
        root,
        meaning,
        origin,
        sampleWords,
      });
    }
  }

  const prefixPath = join(process.cwd(), "reference_data", PREFIX_FILE);
  const prefixContent = readFileSync(prefixPath, "utf8");
  const prefixLines = prefixContent.split(/\r?\n/).filter(Boolean);

  for (const line of prefixLines.slice(1)) {
    const [root = "", meaning = "", sampleWords = ""] = parseCsvLine(line);

    if (!root || !meaning) {
      continue;
    }

    allRows.push({
      root,
      meaning,
      origin: "English prefix list",
      sampleWords,
    });
  }

  const suffixPath = join(process.cwd(), "reference_data", SUFFIX_FILE);
  const suffixContent = readFileSync(suffixPath, "utf8");
  const suffixLines = suffixContent.split(/\r?\n/).filter(Boolean);

  for (const line of suffixLines.slice(1)) {
    const [root = "", meaning = "", sampleWords = ""] = parseCsvLine(line);

    if (!root || !meaning) {
      continue;
    }

    allRows.push({
      root,
      meaning,
      origin: "English suffix list",
      sampleWords,
    });
  }

  const numericPrefixPath = join(
    process.cwd(),
    "reference_data",
    NUMERIC_PREFIX_FILE,
  );
  const numericPrefixContent = readFileSync(numericPrefixPath, "utf8");
  const numericPrefixLines = numericPrefixContent.split(/\r?\n/).filter(Boolean);

  for (const line of numericPrefixLines.slice(1)) {
    const [greekPrefix = "", latinPrefix = "", meaning = "", sampleWords = ""] =
      parseCsvLine(line);

    const mergedRoot = [greekPrefix, latinPrefix].filter(Boolean).join(", ");

    if (!mergedRoot || !meaning) {
      continue;
    }

    allRows.push({
      root: mergedRoot,
      meaning,
      origin: "Numeric prefix family list",
      sampleWords,
    });
  }

  const prefixListPath = join(process.cwd(), "reference_data", PREFIX_LIST_FILE);
  const prefixListContent = readFileSync(prefixListPath, "utf8");
  const prefixListLines = prefixListContent.split(/\r?\n/).filter(Boolean);

  for (const line of prefixListLines.slice(1)) {
    const [root = "", meaning = "", sampleWords = ""] = parseCsvLine(line);

    if (!root || !meaning) {
      continue;
    }

    allRows.push({
      root,
      meaning,
      origin: "Prefix list CSV",
      sampleWords,
    });
  }

  const suffixListPath = join(process.cwd(), "reference_data", SUFFIX_LIST_FILE);
  const suffixListContent = readFileSync(suffixListPath, "utf8");
  const suffixListLines = suffixListContent.split(/\r?\n/).filter(Boolean);

  for (const line of suffixListLines.slice(1)) {
    const [root = "", meaning = "", sampleWords = ""] = parseCsvLine(line);

    if (!root || !meaning) {
      continue;
    }

    allRows.push({
      root,
      meaning,
      origin: "Suffix list CSV",
      sampleWords,
    });
  }

  referenceRowsCache = allRows;
  return allRows;
}

function loadSpellingRuleRows(): SpellingRuleRow[] {
  if (spellingRuleRowsCache) {
    return spellingRuleRowsCache;
  }

  const rulesPath = join(process.cwd(), "reference_data", SPELLING_RULES_FILE);
  const content = readFileSync(rulesPath, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);
  const rows: SpellingRuleRow[] = [];
  const headerCells = parseCsvLine(lines[0] ?? "");
  const headerIndex = new Map<string, number>();

  headerCells.forEach((header, index) => {
    headerIndex.set(header, index);
  });

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const getCell = (columnName: string) =>
      cells[headerIndex.get(columnName) ?? -1] ?? "";

    const ruleLabel = getCell("rule_label");
    const ruleType = getCell("rule_type");
    const patternRole = getCell("pattern_role");
    const matcherScope = getCell("matcher_scope");
    const patternMatchType = getCell("pattern_match_type");
    const pattern = getCell("pattern");
    const description = getCell("description");
    const examples = getCell("examples");
    const exceptions = getCell("exceptions");
    const appliesWhen = getCell("applies_when");

    if (!ruleLabel || !description) {
      continue;
    }

    rows.push({
      ruleLabel,
      ruleType,
      patternRole,
      matcherScope,
      patternMatchType,
      pattern,
      description,
      examples,
      exceptions,
      appliesWhen,
    });
  }

  spellingRuleRowsCache = rows;
  return rows;
}

export function isSpellingRuleShortlistEnabled(): boolean {
  return process.env.SPELLING_COACH_RULE_SHORTLIST === "on";
}

export function isSpellingRulePromptHintsEnabled(): boolean {
  return process.env.SPELLING_COACH_RULE_PROMPT_HINTS === "on";
}

function isVowel(char: string | undefined): boolean {
  return Boolean(char && "aeiou".includes(char));
}

function isConsonant(char: string | undefined): boolean {
  return Boolean(char && /^[a-z]$/.test(char) && !isVowel(char));
}

function matchesLiteralPattern(word: string, pattern: string): boolean {
  const tokens = pattern
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  return tokens.some((token) => {
    if (token.startsWith("-")) {
      return word.endsWith(token.slice(1));
    }

    if (token.endsWith("-")) {
      return word.startsWith(token.slice(0, -1));
    }

    if (token === "silent_t") {
      return word.includes("sten");
    }

    if (token.includes(" ")) {
      return false;
    }

    return word.includes(token);
  });
}

function parseExceptionWords(exceptions: string): string[] {
  return exceptions
    .split(/[;,]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .map((value) => value.replace(/[^a-z-]/g, ""))
    .filter(Boolean);
}

function endsWithVowelTeamBeforeSuffix(
  word: string,
  suffix: string,
): boolean {
  const stem = word.slice(0, -suffix.length);
  return stem.length >= 2
    && isVowel(stem[stem.length - 1])
    && isVowel(stem[stem.length - 2]);
}

function endsWithConsonantBeforeSuffix(
  word: string,
  suffix: string,
): boolean {
  const stem = word.slice(0, -suffix.length);
  return stem.length >= 1 && isConsonant(stem[stem.length - 1]);
}

function endsWithSingleVowelBeforeSuffix(
  word: string,
  suffix: string,
): boolean {
  const stem = word.slice(0, -suffix.length);
  return stem.length >= 1 && isVowel(stem[stem.length - 1]);
}

function matchesRuleSpecificLiteralPattern(
  ruleLabel: string,
  word: string,
): boolean | null {
  if (ruleLabel === "final_ch_after_consonant") {
    return word.endsWith("ch") && endsWithConsonantBeforeSuffix(word, "ch");
  }

  if (ruleLabel === "final_ch_after_two_letter_vowel") {
    return word.endsWith("ch") && endsWithVowelTeamBeforeSuffix(word, "ch");
  }

  if (ruleLabel === "final_tch_after_one_letter_vowel") {
    return word.endsWith("tch") && endsWithSingleVowelBeforeSuffix(word, "tch");
  }

  if (ruleLabel === "tch_after_single_short_vowel") {
    return word.endsWith("tch") && endsWithSingleVowelBeforeSuffix(word, "tch");
  }

  if (ruleLabel === "final_dge_after_short_vowel") {
    return word.endsWith("dge") && endsWithSingleVowelBeforeSuffix(word, "dge");
  }

  if (ruleLabel === "ck_after_single_short_vowel") {
    return word.endsWith("ck") && endsWithSingleVowelBeforeSuffix(word, "ck");
  }

  return null;
}

function matchesShapePattern(word: string, pattern: string): boolean {
  const normalized = pattern.trim().toLowerCase();

  if (normalized === "vowel+consonant+letter e") {
    for (let index = 0; index <= word.length - 3; index += 1) {
      if (
        isVowel(word[index]) &&
        isConsonant(word[index + 1]) &&
        word[index + 2] === "e"
      ) {
        return true;
      }
    }
    return false;
  }

  if (normalized === "vowel+consonant+consonant+letter e") {
    for (let index = 0; index <= word.length - 4; index += 1) {
      if (
        isVowel(word[index]) &&
        isConsonant(word[index + 1]) &&
        isConsonant(word[index + 2]) &&
        word[index + 3] === "e"
      ) {
        return true;
      }
    }
    return false;
  }

  if (normalized === "short vowel+single final consonant") {
    return word.length >= 3
      && isVowel(word[word.length - 2])
      && isConsonant(word[word.length - 1]);
  }

  if (normalized === "consonant+vowel") {
    return word.length >= 2
      && isConsonant(word[0])
      && isVowel(word[1]);
  }

  if (normalized === "base word ending in two consonants") {
    return word.length >= 2
      && isConsonant(word[word.length - 1])
      && isConsonant(word[word.length - 2]);
  }

  if (normalized === "base word ending in letter e") {
    return word.endsWith("e");
  }

  if (normalized === "consonant+y") {
    return word.length >= 2
      && isConsonant(word[word.length - 2])
      && word.endsWith("y");
  }

  if (normalized === "prefix al-") {
    return word.startsWith("al");
  }

  if (normalized === "suffix -ful") {
    return word.endsWith("ful");
  }

  return false;
}

function findMatchingSpellingRules(word: string): SpellingRuleRow[] {
  const normalizedWord = word.toLowerCase();
  const allRules = loadSpellingRuleRows().filter(
    (rule) => rule.matcherScope === "deterministic",
  );
  const matches = allRules.filter((rule) => {
    if (!rule.pattern) {
      return false;
    }

    if (rule.exceptions) {
      const exceptionWords = parseExceptionWords(rule.exceptions);
      if (exceptionWords.includes(normalizedWord)) {
        return false;
      }
    }

    if (rule.patternMatchType === "literal") {
      const ruleSpecificMatch = matchesRuleSpecificLiteralPattern(
        rule.ruleLabel,
        normalizedWord,
      );

      if (ruleSpecificMatch !== null) {
        return ruleSpecificMatch;
      }

      return matchesLiteralPattern(normalizedWord, rule.pattern);
    }

    if (rule.patternMatchType === "shape") {
      return matchesShapePattern(normalizedWord, rule.pattern);
    }

    return false;
  });

  if (matches.length === 0) {
    return [];
  }

  return matches.slice(0, RULE_SHORTLIST_LIMIT);
}

export function getMatchedSpellingRules(word: string): MatchedSpellingRule[] {
  return findMatchingSpellingRules(word).map((rule) => ({
    ruleLabel: rule.ruleLabel,
    description: rule.description,
    patternRole: rule.patternRole,
    patternMatchType: rule.patternMatchType,
    pattern: rule.pattern,
  }));
}

function normalizeVariant(variant: string): string {
  return variant
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z-]/g, "")
    .trim();
}

function getRootVariants(root: string): string[] {
  return root
    .split(",")
    .map((part) => normalizeVariant(part))
    .filter(Boolean);
}

function getCanonicalForm(variant: string): string {
  return variant.replace(/^-+/, "").replace(/-+$/, "");
}

function detectRole(word: string, variant: string, canonicalForm: string): ReferenceHint["role"] {
  if (variant.endsWith("-") && word.startsWith(canonicalForm)) {
    return "prefix";
  }

  if (word.endsWith(canonicalForm) || word.includes(`${canonicalForm}ous`) || word.includes(`${canonicalForm}ic`) || word.includes(`${canonicalForm}y`)) {
    return "suffix_family";
  }

  return "root";
}

export function getReferenceHints(input: SpellingCoachInput): ReferenceHint[] {
  const rows = loadReferenceRows();
  const word = input.targetWord.toLowerCase();
  const matches = new Map<string, ReferenceHint>();

  for (const row of rows) {
    for (const variant of getRootVariants(row.root)) {
      const canonicalForm = getCanonicalForm(variant);

      if (canonicalForm.length < 3) {
        continue;
      }

      if (!word.includes(canonicalForm)) {
        continue;
      }

      const role = detectRole(word, variant, canonicalForm);
      const key = `${row.root}|${canonicalForm}`;
      const source =
        row.origin === "English prefix list"
          ? "prefixes_csv"
          : row.origin === "English suffix list"
            ? "suffixes_csv"
            : row.origin === "Numeric prefix family list"
              ? "numeric_prefixes_csv"
              : row.origin === "Prefix list CSV"
                ? "prefix_list_csv"
                : row.origin === "Suffix list CSV"
                  ? "suffix_list_csv"
            : "roots_csv";
      const nextHint: ReferenceHint = {
        root: row.root,
        matchedForm: canonicalForm,
        meaning: row.meaning,
        origin: row.origin,
        role,
        source,
      };
      const existingHint = matches.get(key);

      if (
        !existingHint ||
        (role === "prefix" &&
          source === "prefixes_csv" &&
          existingHint.source !== "prefixes_csv") ||
        (role === "prefix" &&
          source === "numeric_prefixes_csv" &&
          existingHint.source !== "numeric_prefixes_csv") ||
        (role === "prefix" &&
          source === "prefix_list_csv" &&
          !["prefixes_csv", "numeric_prefixes_csv"].includes(existingHint.source)) ||
        (role === "suffix_family" &&
          source === "suffixes_csv" &&
          existingHint.source !== "suffixes_csv") ||
        (role === "suffix_family" &&
          source === "suffix_list_csv" &&
          existingHint.source !== "suffixes_csv")
      ) {
        matches.set(key, nextHint);
      }
    }
  }

  return Array.from(matches.values())
    .sort((left, right) => {
      const score = (hint: ReferenceHint): number => {
        let total = 0;

        if (hint.role === "prefix" && word.startsWith(hint.matchedForm)) {
          total += 100;
        }

        if (hint.role === "suffix_family" && word.endsWith(hint.matchedForm)) {
          total += 100;
        }

        if (hint.source === "numeric_prefixes_csv") {
          total += 20;
        }

        if (hint.source === "prefixes_csv" || hint.source === "suffixes_csv") {
          total += 15;
        }

        if (hint.source === "prefix_list_csv" || hint.source === "suffix_list_csv") {
          total += 10;
        }

        total += Math.min(hint.matchedForm.length, 12);
        return total;
      };

      return score(right) - score(left);
    })
    .slice(0, 5);
}

export function buildReferenceHintsText(input: SpellingCoachInput): string {
  const hints = getReferenceHints(input);

  if (hints.length === 0) {
    return "No matching local Greek/Latin reference hints found.";
  }

  return hints
    .map(
      (hint) =>
        `- ${hint.root} -> meaning: ${hint.meaning}; origin: ${hint.origin}; matched form in word: ${hint.matchedForm}; role: ${hint.role}; source: ${hint.source}`,
    )
    .join("\n");
}

export function buildSpellingRuleHintsText(
  limit = 24,
  targetWord?: string,
): string {
  const rules =
    targetWord && isSpellingRuleShortlistEnabled()
      ? findMatchingSpellingRules(targetWord)
      : loadSpellingRuleRows()
          .filter((rule) => rule.matcherScope !== "skip")
          .slice(0, limit);

  if (rules.length === 0) {
    return "- none";
  }

  return rules
    .map((rule) => {
      const type = rule.ruleType ? ` (${rule.ruleType})` : "";
      const role = rule.patternRole ? ` pattern_role=${rule.patternRole}` : "";
      const scope = rule.matcherScope ? ` matcher_scope=${rule.matcherScope}` : "";
      const matchType = rule.patternMatchType
        ? ` pattern_match_type=${rule.patternMatchType}`
        : "";
      const pattern = rule.pattern ? ` pattern=${rule.pattern}` : "";
      const exceptions = rule.exceptions
        ? ` exceptions=${rule.exceptions}`
        : "";
      const appliesWhen = rule.appliesWhen
        ? ` Applies when: ${rule.appliesWhen}.`
        : "";
      return `- ${rule.ruleLabel}${type}${role}${scope}${matchType}${pattern}${exceptions}: ${rule.description}${appliesWhen}`;
    })
    .join("\n");
}
