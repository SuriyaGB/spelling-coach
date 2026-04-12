import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  SpellingCoachOutput,
  WordTeachingPrecompute,
} from "./schemas.js";

type BlendPatternCategory =
  | "vowel teams"
  | "consonant blends"
  | "3-letter consonant blends"
  | "digraphs"
  | "r-controlled digraphs"
  | "w-controlled digraphs"
  | "l-controlled digraphs"
  | "silent letter digraphs"
  | "word endings";

type BlendPatternGroup = {
  category: BlendPatternCategory;
  patterns: string[];
};

type BlendPatternMatch = {
  label: string;
  start: number;
  end: number;
  length: number;
};

const SUPPORTED_PATTERN_ORIGINS = ["english", "old norse", "latin", "greek"];

let blendPatternGroupsCache: BlendPatternGroup[] | null = null;

function parsePatternList(value: string): string[] {
  return value
    .replace(/\.$/, "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function loadBlendPatternGroups(): BlendPatternGroup[] {
  if (blendPatternGroupsCache) {
    return blendPatternGroupsCache;
  }

  const content = readFileSync(
    join(process.cwd(), "reference_data", "blends.txt"),
    "utf8",
  );
  const groups: BlendPatternGroup[] = [];

  for (const line of content.split(/\r?\n/).filter(Boolean)) {
    const [rawCategory = "", rawPatterns = ""] = line.split("=");
    const category = rawCategory.trim().toLowerCase() as BlendPatternCategory;
    if (!rawCategory || !rawPatterns) {
      continue;
    }

    groups.push({
      category,
      patterns: parsePatternList(rawPatterns),
    });
  }

  blendPatternGroupsCache = groups;
  return groups;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function supportsBlendPatternMatching(origin?: string): boolean {
  const normalizedOrigin = origin?.trim().toLowerCase();
  if (!normalizedOrigin) {
    return false;
  }

  return SUPPORTED_PATTERN_ORIGINS.some((allowedOrigin) =>
    normalizedOrigin.includes(allowedOrigin),
  );
}

function mergePatternTexts(
  matchedPatterns: string[],
  existingPatterns: string[],
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const value of [...matchedPatterns, ...existingPatterns]) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    merged.push(value);
  }

  return merged;
}

function formatMatchedPattern(
  category: BlendPatternCategory,
  pattern: string,
): string {
  switch (category) {
    case "vowel teams":
      return `vowel team ${pattern} -D`;
    case "consonant blends":
      return `blend ${pattern} -D`;
    case "3-letter consonant blends":
      return `3-letter blend ${pattern} -D`;
    case "digraphs":
      return `digraph ${pattern} -D`;
    case "r-controlled digraphs":
      return `r-controlled digraph ${pattern} -D`;
    case "w-controlled digraphs":
      return `w-controlled digraph ${pattern} -D`;
    case "l-controlled digraphs":
      return `l-controlled digraph ${pattern} -D`;
    case "silent letter digraphs":
      return `silent letter digraph ${pattern} -D`;
    case "word endings":
      return `word ending -${pattern} -D`;
  }
}

function overlaps(left: BlendPatternMatch, right: BlendPatternMatch): boolean {
  return left.start < right.end && right.start < left.end;
}

export function getMatchedBlendPatterns(targetWord: string): string[] {
  const normalizedWord = targetWord.trim().toLowerCase();
  if (!normalizedWord) {
    return [];
  }

  const matched: BlendPatternMatch[] = [];

  for (const group of loadBlendPatternGroups()) {
    for (const pattern of group.patterns) {
      if (group.category === "word endings") {
        if (normalizedWord.endsWith(pattern)) {
          matched.push({
            label: formatMatchedPattern(group.category, pattern),
            start: normalizedWord.length - pattern.length,
            end: normalizedWord.length,
            length: pattern.length,
          });
        }
        continue;
      }

      let startIndex = normalizedWord.indexOf(pattern);
      while (startIndex !== -1) {
        matched.push({
          label: formatMatchedPattern(group.category, pattern),
          start: startIndex,
          end: startIndex + pattern.length,
          length: pattern.length,
        });
        startIndex = normalizedWord.indexOf(pattern, startIndex + 1);
      }
    }
  }

  matched.sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }

    return left.start - right.start;
  });

  const kept: BlendPatternMatch[] = [];
  for (const candidate of matched) {
    if (kept.some((existing) => overlaps(existing, candidate))) {
      continue;
    }
    kept.push(candidate);
  }

  kept.sort((left, right) => left.start - right.start);
  return unique(kept.map((match) => match.label));
}

export function applyBlendPatternsToPrecompute(
  targetWord: string,
  precompute: WordTeachingPrecompute,
  origin?: string,
): WordTeachingPrecompute {
  if (!supportsBlendPatternMatching(origin)) {
    return precompute;
  }

  const matchedPatterns = getMatchedBlendPatterns(targetWord);
  if (matchedPatterns.length === 0) {
    return precompute;
  }

  return {
    ...precompute,
    wordTeaching: {
      ...precompute.wordTeaching,
      formTeaching: {
        ...precompute.wordTeaching.formTeaching,
        patterns: mergePatternTexts(
          matchedPatterns,
          precompute.wordTeaching.formTeaching.patterns,
        ),
      },
    },
  };
}

export function applyBlendPatternsToOutput(
  targetWord: string,
  output: SpellingCoachOutput,
  origin?: string,
): SpellingCoachOutput {
  if (!supportsBlendPatternMatching(origin)) {
    return output;
  }

  const matchedPatterns = getMatchedBlendPatterns(targetWord);
  if (matchedPatterns.length === 0) {
    return output;
  }

  return {
    ...output,
    wordTeaching: {
      ...output.wordTeaching,
      formTeaching: {
        ...output.wordTeaching.formTeaching,
        patterns: mergePatternTexts(
          matchedPatterns,
          output.wordTeaching.formTeaching.patterns,
        ),
      },
    },
  };
}
