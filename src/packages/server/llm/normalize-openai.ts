import { isOpenAIModel, type OpenAIModel } from "@cocalc/util/db-schema/llm-utils";

// Normalize OpenAI model names by collapsing preview/8k variants to a base name.
export function normalizeOpenAIModel(model: string): OpenAIModel {
  const modelPrefixes = [
    "gpt-5-mini",
    "gpt-5",
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4-turbo",
    "gpt-4.1-mini",
    "gpt-4.1",
    "o4-mini",
    "o3",
    "o1-mini",
    "o1",
  ];

  for (const prefix of modelPrefixes) {
    if (model.startsWith(prefix)) {
      model = prefix;
      break;
    }
  }

  if (!isOpenAIModel(model)) {
    throw new Error(`Internal problem normalizing OpenAI model name: ${model}`);
  }
  return model;
}

