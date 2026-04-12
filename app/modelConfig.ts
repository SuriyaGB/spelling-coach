export const DEFAULT_MODEL_NAME = "openai:gpt-4.1-mini";

export function getConfiguredModelName(): string {
  return process.env.SPELLING_COACH_MODEL ?? DEFAULT_MODEL_NAME;
}

export function getOpenAITemperature(modelName: string): number {
  return modelName.startsWith("openai:gpt-4") ? 0 : 1;
}
