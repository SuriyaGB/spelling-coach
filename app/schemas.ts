import { z } from "zod";

export const ChildProfileSchema = z.object({
  childId: z.string(),
  age: z.number().int().nonnegative(),
  grade: z.string(),
  spellingLevel: z.string(),
});

export const WordMetadataSchema = z
  .object({
    definition: z.string().optional(),
    origin: z.string().optional(),
    partOfSpeech: z.string().optional(),
    exampleSentence: z.string().optional(),
    pronunciation: z.string().optional(),
  })
  .strict()
  .optional();

export const MissSignalsSchema = z
  .object({
    isCorrect: z.boolean(),
    nearMiss: z.boolean(),
    missingLetters: z.array(z.string()),
    extraLetters: z.array(z.string()),
    substitutedLetters: z.array(z.string()),
    transposedLetters: z.array(z.string()),
    repeatedLetterIssue: z.boolean(),
    likelyRushed: z.boolean(),
    editDistance: z.number().nonnegative(),
  })
  .strict();

export const StructuralHintsSchema = z
  .object({
    syllables: z.array(z.string()).default([]),
    likelyChunks: z.array(z.string()).default([]),
    detectedPatterns: z.array(z.string()).default([]),
    likelyPrefix: z.string().optional(),
    likelySuffix: z.string().optional(),
  })
  .strict();

export const SessionContextSchema = z
  .object({
    mode: z.string(),
    previousAttemptsOnThisWord: z.number().int().nonnegative(),
    previousMissPatterns: z.array(z.string()),
    recentlyPracticedWords: z.array(z.string()),
  })
  .strict();

export const SpellingCoachInputSchema = z
  .object({
    targetWord: z.string().min(1),
    childAttempt: z.string(),
    childProfile: ChildProfileSchema,
    wordMetadata: WordMetadataSchema,
    missSignals: MissSignalsSchema,
    structuralHints: StructuralHintsSchema,
    sessionContext: SessionContextSchema,
  })
  .strict();

export const TeachingStrategySchema = z.enum([
  "concept",
  "pattern",
  "chunking",
  "memory",
  "mixed",
]);

export const ErrorRelevanceSchema = z.enum([
  "form",
  "concept",
  "mixed",
  "unclear",
]);

export const WordTeachingSchema = z
  .object({
    formTeaching: z
      .object({
        summary: z.string(),
        patterns: z.array(z.string()),
        chunks: z.array(z.string()),
        chunkReason: z.string(),
        sayAloudFocus: z.string(),
      })
      .strict(),
    conceptTeaching: z
      .object({
        summary: z.string(),
        meaningFocus: z.string(),
        originFocus: z.string(),
        morphologyFocus: z.string(),
        originLabels: z.array(z.string()),
        morphologyLabels: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export const WordBreakdownSchema = z
  .object({
    displayChunks: z.array(z.string()),
    chunkReason: z.string(),
  })
  .strict();

export const ConceptLabelsSchema = z
  .object({
    originLabels: z.array(z.string()),
    patternLabels: z.array(z.string()),
    morphologyLabels: z.array(z.string()),
  })
  .strict();

export const CorrectnessSchema = z
  .object({
    isCorrect: z.boolean(),
    reinforceSuccess: z.boolean(),
  })
  .strict();

export const MissAnalysisSchema = z
  .object({
    summary: z.string(),
    errorTypes: z.array(z.string()),
    primaryErrorFocus: z.string(),
    likelyWrongWordInterpretation: z.boolean(),
    usedMeaningDisambiguationWell: z.boolean(),
  })
  .strict();

export const ErrorRelevanceDetailSchema = z
  .object({
    mostRelevantToError: ErrorRelevanceSchema,
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  })
  .strict();

export const TeachingDecisionDetailSchema = z
  .object({
    strategy: TeachingStrategySchema,
    primaryFocus: z.string(),
    secondaryFocuses: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  })
  .strict();

export const CoachingTextSchema = z
  .object({
    shortFeedback: z.string(),
    fullExplanation: z.string(),
    memoryTip: z.string(),
    sayAloudTip: z.string(),
  })
  .strict();

export const NextStepSchema = z
  .object({
    practiceFocus: z.string(),
    shouldReviewSoon: z.boolean(),
    suggestedSimilarWordTypes: z.array(z.string()),
  })
  .strict();

export const WordTeachingPrecomputeSchema = z
  .object({
    wordTeaching: WordTeachingSchema,
    wordBreakdown: WordBreakdownSchema,
    conceptLabels: ConceptLabelsSchema,
  })
  .strict();

export const MissOnlyOutputSchema = z
  .object({
    correctness: CorrectnessSchema,
    missAnalysis: MissAnalysisSchema,
    errorRelevance: ErrorRelevanceDetailSchema,
    teachingDecision: TeachingDecisionDetailSchema,
    coachingText: CoachingTextSchema,
    nextStep: NextStepSchema,
  })
  .strict();

export const DeterministicPatternFilterOutputSchema = z
  .object({
    keptDescriptions: z.array(z.string()),
  })
  .strict();

export const SpellingCoachOutputSchema = z
  .object({
    correctness: CorrectnessSchema,
    missAnalysis: MissAnalysisSchema,
    wordTeaching: WordTeachingSchema,
    errorRelevance: ErrorRelevanceDetailSchema,
    teachingDecision: TeachingDecisionDetailSchema,
    coachingText: CoachingTextSchema,
    wordBreakdown: WordBreakdownSchema,
    conceptLabels: ConceptLabelsSchema,
    nextStep: NextStepSchema,
  })
  .strict();

export type SpellingCoachInput = z.infer<typeof SpellingCoachInputSchema>;
export type SpellingCoachOutput = z.infer<typeof SpellingCoachOutputSchema>;
export type WordTeachingPrecompute = z.infer<typeof WordTeachingPrecomputeSchema>;
export type MissOnlyOutput = z.infer<typeof MissOnlyOutputSchema>;
export type DeterministicPatternFilterOutput = z.infer<
  typeof DeterministicPatternFilterOutputSchema
>;

export function parseSpellingCoachInput(input: unknown): SpellingCoachInput {
  return SpellingCoachInputSchema.parse(input);
}

export function parseSpellingCoachOutput(output: unknown): SpellingCoachOutput {
  return SpellingCoachOutputSchema.parse(output);
}

export function parseWordTeachingPrecompute(
  output: unknown,
): WordTeachingPrecompute {
  return WordTeachingPrecomputeSchema.parse(output);
}

export function parseMissOnlyOutput(output: unknown): MissOnlyOutput {
  return MissOnlyOutputSchema.parse(output);
}

export function parseDeterministicPatternFilterOutput(
  output: unknown,
): DeterministicPatternFilterOutput {
  return DeterministicPatternFilterOutputSchema.parse(output);
}
