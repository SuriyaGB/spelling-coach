import type {
  DeterministicPatternFilterOutput,
  SpellingCoachOutput,
  WordTeachingPrecompute,
} from "./schemas.js";
import {
  getMatchedSpellingRules,
  type MatchedSpellingRule,
} from "./referenceData.js";

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function markDeterministicPattern(description: string): string {
  return `${description} -D`;
}

function mergePatternTexts(
  deterministicDescriptions: string[],
  existingPatterns: string[],
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const value of [...deterministicDescriptions, ...existingPatterns]) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    merged.push(value);
  }

  return merged;
}

function mergeLabels(
  deterministicLabels: string[],
  existingLabels: string[],
): string[] {
  return unique([...deterministicLabels, ...existingLabels]);
}

function filterMatchesByDescriptions(
  matches: MatchedSpellingRule[],
  keptDescriptions: string[],
): MatchedSpellingRule[] {
  const kept = new Set(keptDescriptions.map((value) => value.trim().toLowerCase()));
  return matches.filter((match) => kept.has(match.description.trim().toLowerCase()));
}

export function getDeterministicPatternCandidates(
  targetWord: string,
): MatchedSpellingRule[] {
  return getMatchedSpellingRules(targetWord);
}

export function applyDeterministicPatternsToPrecompute(
  targetWord: string,
  precompute: WordTeachingPrecompute,
): WordTeachingPrecompute {
  const matches = getDeterministicPatternCandidates(targetWord);

  if (matches.length === 0) {
    return precompute;
  }

  return {
    ...precompute,
    wordTeaching: {
      ...precompute.wordTeaching,
      formTeaching: {
        ...precompute.wordTeaching.formTeaching,
        patterns: mergePatternTexts(
          matches.map((match) => markDeterministicPattern(match.description)),
          precompute.wordTeaching.formTeaching.patterns,
        ),
      },
    },
    conceptLabels: {
      ...precompute.conceptLabels,
      patternLabels: mergeLabels(
        matches.map((match) => match.ruleLabel),
        precompute.conceptLabels.patternLabels,
      ),
    },
  };
}

export function applyDeterministicPatternsToOutput(
  targetWord: string,
  output: SpellingCoachOutput,
): SpellingCoachOutput {
  const matches = getDeterministicPatternCandidates(targetWord);

  if (matches.length === 0) {
    return output;
  }

  return {
    ...output,
    wordTeaching: {
      ...output.wordTeaching,
      formTeaching: {
        ...output.wordTeaching.formTeaching,
        patterns: mergePatternTexts(
          matches.map((match) => markDeterministicPattern(match.description)),
          output.wordTeaching.formTeaching.patterns,
        ),
      },
    },
    conceptLabels: {
      ...output.conceptLabels,
      patternLabels: mergeLabels(
        matches.map((match) => match.ruleLabel),
        output.conceptLabels.patternLabels,
      ),
    },
  };
}

export function applyFilteredDeterministicPatternsToPrecompute(
  precompute: WordTeachingPrecompute,
  matches: MatchedSpellingRule[],
  filterOutput: DeterministicPatternFilterOutput,
): WordTeachingPrecompute {
  const keptMatches = filterMatchesByDescriptions(
    matches,
    filterOutput.keptDescriptions,
  );

  if (keptMatches.length === 0) {
    return precompute;
  }

  return {
    ...precompute,
    wordTeaching: {
      ...precompute.wordTeaching,
      formTeaching: {
        ...precompute.wordTeaching.formTeaching,
        patterns: mergePatternTexts(
          keptMatches.map((match) => markDeterministicPattern(match.description)),
          precompute.wordTeaching.formTeaching.patterns,
        ),
      },
    },
    conceptLabels: {
      ...precompute.conceptLabels,
      patternLabels: mergeLabels(
        keptMatches.map((match) => match.ruleLabel),
        precompute.conceptLabels.patternLabels,
      ),
    },
  };
}

export function applyFilteredDeterministicPatternsToOutput(
  output: SpellingCoachOutput,
  matches: MatchedSpellingRule[],
  filterOutput: DeterministicPatternFilterOutput,
): SpellingCoachOutput {
  const keptMatches = filterMatchesByDescriptions(
    matches,
    filterOutput.keptDescriptions,
  );

  if (keptMatches.length === 0) {
    return output;
  }

  return {
    ...output,
    wordTeaching: {
      ...output.wordTeaching,
      formTeaching: {
        ...output.wordTeaching.formTeaching,
        patterns: mergePatternTexts(
          keptMatches.map((match) => markDeterministicPattern(match.description)),
          output.wordTeaching.formTeaching.patterns,
        ),
      },
    },
    conceptLabels: {
      ...output.conceptLabels,
      patternLabels: mergeLabels(
        keptMatches.map((match) => match.ruleLabel),
        output.conceptLabels.patternLabels,
      ),
    },
  };
}
