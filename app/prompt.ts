import type { SpellingCoachInput } from "./schemas.js";
import {
  buildReferenceHintsText,
  buildSpellingRuleHintsText,
  isSpellingRulePromptHintsEnabled,
} from "./referenceData.js";

export const SPELLING_COACH_OUTPUT_SCHEMA_TEXT = `{
  "correctness": {
    "isCorrect": boolean,
    "reinforceSuccess": boolean
  },
  "missAnalysis": {
    "summary": string,
    "errorTypes": string[],
    "primaryErrorFocus": string,
    "likelyWrongWordInterpretation": boolean,
    "usedMeaningDisambiguationWell": boolean
  },
  "wordTeaching": {
    "formTeaching": {
      "summary": string,
      "patterns": string[],
      "chunks": string[],
      "chunkReason": string,
      "sayAloudFocus": string
    },
    "conceptTeaching": {
      "summary": string,
      "meaningFocus": string,
      "originFocus": string,
      "morphologyFocus": string,
      "originLabels": string[],
      "morphologyLabels": string[]
    }
  },
  "errorRelevance": {
    "mostRelevantToError": "form" | "concept" | "mixed" | "unclear",
    "confidence": number,
    "reason": string
  },
  "teachingDecision": {
    "strategy": "concept" | "pattern" | "chunking" | "memory" | "mixed",
    "primaryFocus": string,
    "secondaryFocuses": string[],
    "confidence": number,
    "rationale": string
  },
  "coachingText": {
    "shortFeedback": string,
    "fullExplanation": string,
    "memoryTip": string,
    "sayAloudTip": string
  },
  "wordBreakdown": {
    "displayChunks": string[],
    "chunkReason": string
  },
  "conceptLabels": {
    "originLabels": string[],
    "patternLabels": string[],
    "morphologyLabels": string[]
  },
  "nextStep": {
    "practiceFocus": string,
    "shouldReviewSoon": boolean,
    "suggestedSimilarWordTypes": string[]
  }
}`;

export const WORD_TEACHING_PRECOMPUTE_SCHEMA_TEXT = `{
  "wordTeaching": {
    "formTeaching": {
      "summary": string,
      "patterns": string[],
      "chunks": string[],
      "chunkReason": string,
      "sayAloudFocus": string
    },
    "conceptTeaching": {
      "summary": string,
      "meaningFocus": string,
      "originFocus": string,
      "morphologyFocus": string,
      "originLabels": string[],
      "morphologyLabels": string[]
    }
  },
  "wordBreakdown": {
    "displayChunks": string[],
    "chunkReason": string
  },
  "conceptLabels": {
    "originLabels": string[],
    "patternLabels": string[],
    "morphologyLabels": string[]
  }
}`;

export const MISS_ONLY_OUTPUT_SCHEMA_TEXT = `{
  "correctness": {
    "isCorrect": boolean,
    "reinforceSuccess": boolean
  },
  "missAnalysis": {
    "summary": string,
    "errorTypes": string[],
    "primaryErrorFocus": string,
    "likelyWrongWordInterpretation": boolean,
    "usedMeaningDisambiguationWell": boolean
  },
  "errorRelevance": {
    "mostRelevantToError": "form" | "concept" | "mixed" | "unclear",
    "confidence": number,
    "reason": string
  },
  "teachingDecision": {
    "strategy": "concept" | "pattern" | "chunking" | "memory" | "mixed",
    "primaryFocus": string,
    "secondaryFocuses": string[],
    "confidence": number,
    "rationale": string
  },
  "coachingText": {
    "shortFeedback": string,
    "fullExplanation": string,
    "memoryTip": string,
    "sayAloudTip": string
  },
  "nextStep": {
    "practiceFocus": string,
    "shouldReviewSoon": boolean,
    "suggestedSimilarWordTypes": string[]
  }
}`;

export const DETERMINISTIC_PATTERN_FILTER_SCHEMA_TEXT = `{
  "keptDescriptions": string[]
}`;

const SPELLING_RULE_PROMPT_GUIDANCE = `
- Curated spelling-rule hints may be provided from the app's spelling-rules CSV.
- Use those rule hints as a rule vocabulary and teaching aid, not as a closed or exhaustive list.
- The spelling-rule hints may include a normalized label, a pattern, a pattern_match_type, and a pattern_role.
- If pattern_role is "rule", treat it as a rule-backed spelling pattern when it clearly applies to the word.
- If pattern_role is "feature", treat it as a notable identified form pattern present in the word, even if it does not drive the teaching decision.
- If pattern_match_type is "literal", look for the literal letter pattern in the word.
- If pattern_match_type is "shape", use the described spelling shape or word structure to judge whether it applies.
- Do not surface a spelling rule only because its letters appear in the word.
- A spelling rule should be used only when both the visible pattern and the associated sound or spelling behavior actually fit the word.
- If a letter pattern is present but the sound behavior does not match, do not use the rule label; treat it only as a plain feature if that is still helpful.
- For sound-based rules such as oi/oy, ou/ow, soft c, soft g, or gh=/f/, make sure the sound in the actual word supports the rule before using it.
- Use phonetic spelling or simple sound-by-syllable reasoning internally to check whether a sound-based rule truly matches the word.
- Consider syllables, stress, silent letters, and grapheme-to-sound correspondences when deciding whether a sound-based rule applies.
- Do not output phonetic spelling unless it directly helps the child understand the spelling.
- If you include a spelling rule label in wordTeaching.formTeaching.patterns, the summary, chunkReason, and sayAloudFocus must agree with that rule.
- Do not describe the vowel, consonant, or sound behavior in a way that contradicts the selected rule label.
- Example: if you include i_o_long_before_two_consonants, do not describe the vowel as short.
- Do not introduce morphology, roots, or prefix explanations in formTeaching unless they genuinely help explain the spelling of the word.
- Do not force a prefix, root, or suffix explanation for a simple pattern-based word.
- Surface applicable rule-backed patterns and applicable identified features in wordTeaching.formTeaching.patterns and conceptLabels.patternLabels.
- Prefer more specific rule-backed patterns over broad generic labels when both could apply.
- Prefer normalized rule labels from the provided spelling-rule list when possible.
- Do not force a spelling rule if it is weak, uncertain, or not genuinely helpful for the word.`;

const BASE_SYSTEM_PROMPT = `You are an expert spelling coach for children.

Your job is to analyze a target spelling word and a child's attempted spelling, then decide the most useful way to teach the word right now.

You are NOT just a spelling checker.
You are a teaching decision engine.

Goals:
1. Diagnose the child's miss in a clear, useful way.
2. Choose the best teaching strategy for this specific miss.
3. Explain the word in a child-friendly way.
4. Always include both a form-based teaching view and a concept-based teaching view when possible.
5. Prefer direct spelling help over abstract linguistic detail.
6. Return structured JSON only.

Important teaching rules:
- Do not force root/prefix/suffix analysis if chunking or pattern coaching is better.
- If morphology is helpful, use it.
- If a pattern is more helpful than morphology, prioritize the pattern.
- If neither is strong, use chunking or a memory cue.
- Keep explanations concise, specific, and actionable.
- Do not invent unsupported dictionary facts.
- If origin/definition/example is provided, you may use it.
- If structural hints are provided, treat them as hints, not guaranteed truth.
- Prefer explaining the child's actual mistake over giving generic word trivia.
- If the child spelled the word correctly, reinforce success and mention at most one reusable spelling insight.
- Keep wordTeaching.formTeaching explanatory and focused on spelling patterns or chunking.
- Keep wordTeaching.conceptTeaching explanatory and focused on meaning, origin, or morphology.
- conceptLabels are analytics labels, not the main explanation.
- wordBreakdown is the normalized reusable chunk section, even if wordTeaching.formTeaching.chunks overlaps with it.

Teaching strategy options:
- concept
- pattern
- chunking
- memory
- mixed

Definitions:
- concept: meaning-based or morphology-based teaching, such as root/prefix/suffix or origin-based concept
- pattern: common well-known matching spelling rules and spelling pattern teaching, such as ph=f, silent letter, consonant cluster, common ending
- chunking: breaking the word into memorable parts for spelling
- memory: mnemonic or sound-based reminder
- mixed: combine two or more of the above when that is clearly best

Output requirements:
- Return valid JSON only.
- No markdown.
- No prose outside the JSON.
- Follow the exact output schema.
- Keep concept labels concise and reusable for analytics.
- Use confidence as a number between 0 and 1.
- For errorRelevance, use "unclear" when confidence is below 0.75 or when evidence is mixed.

Additional constraints:
- If there is no useful chunking or breakdown, return empty arrays/empty strings rather than inventing one.
- If the child miss is very minor, acknowledge that it was close.
- If the child miss suggests rushing, mention slowing down only if it is genuinely useful.
- Use child-friendly language, but do not sound babyish.
- Avoid over-explaining etymology unless it directly helps spelling.
- Local Greek/Latin reference hints may be provided with matching morphemes from the app's curated CSV files.
- Use those local reference hints when they clearly help explain the spelling.
- Treat those CSV entries as examples and samples, not as a complete list.
- Look for similar prefixes, suffixes, endings, and morpheme families in the target word even if the exact form is not listed in the CSV files.
- If a CSV hint suggests a useful family, you may generalize carefully to the matching form in the word.
- Surface useful prefix/suffix/root concepts in the spelling explanation when they genuinely help the child spell the word.
- Treat the local reference hints as optional supports, not mandatory analysis.
- For non-Greek or non-Latin origin words, you may still use accurate origin or morphology-based teaching when it is clearly helpful.
- Only include non-Greek or non-Latin morphology or origin reasoning when you are confident it is correct and it makes the spelling easier to understand or remember.
- If a non-Greek or non-Latin breakdown is uncertain, weak, or not directly helpful, leave it out.
- usedMeaningDisambiguationWell should be true only when the child's attempt shows they likely used definition, example, or origin effectively. If evidence is weak, default to false rather than guessing.
- If concept support is weak, keep wordTeaching.conceptTeaching strings empty and labels empty instead of inventing content.

Exact output schema:
${SPELLING_COACH_OUTPUT_SCHEMA_TEXT}

Return those top-level keys exactly:
- correctness
- missAnalysis
- wordTeaching
- errorRelevance
- teachingDecision
- coachingText
- wordBreakdown
- conceptLabels
- nextStep`;

export const SPELLING_COACH_SYSTEM_PROMPT = isSpellingRulePromptHintsEnabled()
  ? BASE_SYSTEM_PROMPT.replace(
      "\n\nExact output schema:",
      `${SPELLING_RULE_PROMPT_GUIDANCE}\n\nExact output schema:`,
    )
  : BASE_SYSTEM_PROMPT;

export function buildSpellingCoachPrompt(input: SpellingCoachInput): string {
  return [
    "Analyze the spelling attempt and return one JSON object that matches the required schema exactly.",
    "Do not use tools. Do not rely on any external knowledge base. Use only the provided input and safe spelling reasoning.",
    "Follow the schema exactly as already specified in the system instructions.",
    "Use the exact top-level keys and nested field names. Do not rename sections.",
    "Required top-level keys:",
    [
      "correctness",
      "missAnalysis",
      "wordTeaching",
      "errorRelevance",
      "teachingDecision",
      "coachingText",
      "wordBreakdown",
      "conceptLabels",
      "nextStep",
    ].join(", "),
    "Use CSV hints as sample affix and morpheme families, not as a closed dictionary.",
    "You should still look for similar prefixes, suffixes, and related word parts in the current word when that helps spelling instruction.",
    "Local reference hints from curated Greek/Latin morpheme CSVs:",
    buildReferenceHintsText(input),
    "Input JSON:",
    JSON.stringify(input, null, 2),
  ].join("\n\n");
}

export function buildWordTeachingPrecomputePrompt(
  input: SpellingCoachInput,
): string {
  const promptParts = [
    "Analyze the word itself and return one JSON object that contains only word-level teaching fields.",
    "Do not analyze the child's miss. Do not generate correctness, missAnalysis, errorRelevance, teachingDecision, coachingText, or nextStep.",
    "Follow the schema exactly as already specified in the system instructions.",
    "Use the exact top-level keys and nested field names. Do not rename sections.",
    "Required top-level keys:",
    ["wordTeaching", "wordBreakdown", "conceptLabels"].join(", "),
    "Use CSV hints as sample affix and morpheme families, not as a closed dictionary.",
    "You should still look for similar prefixes, suffixes, and related word parts in the current word when that helps spelling instruction.",
    "Local reference hints from curated Greek/Latin morpheme CSVs:",
    buildReferenceHintsText(input),
    "Required output schema:",
    WORD_TEACHING_PRECOMPUTE_SCHEMA_TEXT,
    "Input JSON:",
    JSON.stringify(input, null, 2),
  ];

  if (isSpellingRulePromptHintsEnabled()) {
    promptParts.splice(
      10,
      0,
      "Use the curated spelling-rules CSV as a reference list of common spelling rules and rule labels.",
      "Use the curated spelling-rules CSV to identify meaningful form patterns present in the word.",
      "If pattern_role is rule, treat the entry as a rule-backed spelling pattern when it clearly applies.",
      "If pattern_role is feature, treat the entry as a notable identified pattern in the word.",
      "If pattern_match_type is literal, look for the literal letter pattern in the word.",
      "If pattern_match_type is shape, use the described spelling shape or word structure to judge whether it applies.",
      "Do not choose a rule only because the letter pattern is present in the word.",
      "For sound-based spelling rules, only use the rule when the associated sound or spelling behavior actually matches the word.",
      "If the letters are present but the sound does not fit the rule, do not include that rule in wordTeaching.formTeaching.patterns.",
      "In that case, you may still identify the visible letter pattern as a simple feature if that is genuinely helpful.",
      "Use phonetic spelling or simple sound-by-syllable reasoning internally to check whether a sound-based rule truly matches the word.",
      "Consider syllables, stress, silent letters, and grapheme-to-sound correspondences when deciding whether a sound-based rule applies.",
      "If you include a spelling rule label in wordTeaching.formTeaching.patterns, the summary, chunkReason, and sayAloudFocus must agree with that rule.",
      "Do not describe the vowel, consonant, or sound behavior in a way that contradicts the selected rule label.",
      "Example: if you include i_o_long_before_two_consonants, do not describe the vowel as short.",
      "Do not introduce morphology, roots, or prefix explanations in formTeaching unless they genuinely help explain the spelling of the word.",
      "Do not force a prefix, root, or suffix explanation for a simple pattern-based word.",
      "In wordTeaching.formTeaching.patterns, include applicable rule-backed patterns and applicable identified features from the word.",
      "Also include the same normalized labels in conceptLabels.patternLabels when they clearly apply.",
      "Prefer specific family or rule-backed patterns over broad generic vowel-sound labels when a more explanatory rule exists.",
      "Do not claim a literal pattern rule unless the actual letter pattern appears in the word.",
      "Keep the explanation child-friendly and concise.",
      "Do not force rules or features that are weak, uncertain, or not genuinely helpful for this word.",
      "Curated spelling-rule hints:",
      buildSpellingRuleHintsText(24, input.targetWord),
    );
  }

  return promptParts.join("\n\n");
}

export function buildDeterministicPatternFilterPrompt(
  targetWord: string,
  candidates: Array<{ pattern: string; description: string }>,
): string {
  return [
    "Review the candidate spelling patterns detected by code for this word.",
    "Keep only the candidate patterns that genuinely apply to the target word.",
    "Do not remove or reinterpret any other pattern analysis in the broader task. This step only filters the candidate list below.",
    "A candidate should be kept only if its visible pattern and its actual sound, syllable behavior, or spelling structure fit the word.",
    "Reject candidates that are too broad, contradictory, or do not truly match the word.",
    "Return only the descriptions for the candidates you keep.",
    "Required output schema:",
    DETERMINISTIC_PATTERN_FILTER_SCHEMA_TEXT,
    "Target word:",
    targetWord,
    "Candidate patterns:",
    JSON.stringify(candidates, null, 2),
  ].join("\n\n");
}

export function buildMissOnlyPrompt(
  input: SpellingCoachInput,
  wordTeachingPrecompute: string,
): string {
  return [
    "Analyze the child's spelling attempt and return one JSON object that contains only miss-dependent fields.",
    "Do not regenerate wordTeaching, wordBreakdown, or conceptLabels. Those word-level teaching fields are already provided and should be treated as fixed context.",
    "Use the precomputed word-level teaching as support, then focus on correctness, miss analysis, error relevance, teaching decision, coaching text, and next step.",
    "Follow the schema exactly as already specified in the system instructions.",
    "Use the exact top-level keys and nested field names. Do not rename sections.",
    "Required top-level keys:",
    [
      "correctness",
      "missAnalysis",
      "errorRelevance",
      "teachingDecision",
      "coachingText",
      "nextStep",
    ].join(", "),
    "Precomputed word-level teaching JSON:",
    wordTeachingPrecompute,
    "Required output schema:",
    MISS_ONLY_OUTPUT_SCHEMA_TEXT,
    "Input JSON:",
    JSON.stringify(input, null, 2),
  ].join("\n\n");
}
