// this contains bits and pieces from the wrongly named openai.ts file

import type { LLMService, Service } from "@cocalc/util/db-schema/purchases";
import { unreachable } from "../misc";

export const LANGUAGE_MODELS = [
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k",
  "gpt-4",
  "gpt-4-32k",
  // google's are taken from here – we use the generative AI client lib
  // https://developers.generativeai.google/models/language
  "text-bison-001",
  "chat-bison-001",
  "embedding-gecko-001",
  "text-embedding-ada-002",
  "gemini-pro",
] as const;

// This hardcodes which models can be selected by users.
// Make sure to update this when adding new models.
// This is used in e.g. mentionable-users.tsx, model-switch.tsx and other-settings.tsx
export const USER_SELECTABLE_LANGUAGE_MODELS: Readonly<LanguageModel[]> = [
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k",
  "gpt-4",
  // "chat-bison-001", // PaLM2 is not good, replies with no response too often
  "gemini-pro",
] as const;

export type LanguageModel = (typeof LANGUAGE_MODELS)[number];

export function isLanguageModel(model?: string): model is LanguageModel {
  return LANGUAGE_MODELS.includes(model as LanguageModel);
}

export function getValidLanguageModelName(
  model: string | undefined,
  filter: { google: boolean; openai: boolean; ollama: boolean } = {
    google: true,
    openai: true,
    ollama: false,
  },
  ollama: string[] = [], // keys of ollama models
): LanguageModel | string {
  const dftl =
    filter.openai === true
      ? DEFAULT_MODEL
      : filter.ollama && ollama?.length > 0
      ? toOllamaModel(ollama[0])
      : "chat-bison-001";
  if (model == null) {
    return dftl;
  }
  if (LANGUAGE_MODELS.includes(model as LanguageModel)) {
    return model;
  }
  if (isOllamaLLM(model) && ollama.includes(fromOllamaModel(model))) {
    return model;
  }
  return dftl;
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export type OpenAIMessages = OpenAIMessage[];

export type LanguageService =
  | "openai-gpt-3.5-turbo"
  | "openai-gpt-3.5-turbo-16k"
  | "openai-gpt-4"
  | "openai-gpt-4-32k"
  | "openai-text-embedding-ada-002"
  | "google-text-bison-001"
  | "google-chat-bison-001"
  | "google-embedding-gecko-001"
  | "google-gemini-pro";

const LANGUAGE_MODEL_VENDORS = ["openai", "google", "ollama"] as const;
export type Vendor = (typeof LANGUAGE_MODEL_VENDORS)[number];

// used e.g. for checking "account-id={string}" and other things like that
export const LANGUAGE_MODEL_PREFIXES = [
  "chatgpt",
  ...LANGUAGE_MODEL_VENDORS.map((v) => `${v}-`),
] as const;

export function model2service(
  model: LanguageModel | string,
): LanguageService | string {
  if (model === "text-embedding-ada-002") {
    return `openai-${model}`;
  }
  if (isLanguageModel(model)) {
    if (
      model === "text-bison-001" ||
      model === "chat-bison-001" ||
      model === "embedding-gecko-001" ||
      model === "gemini-pro"
    ) {
      return `google-${model}`;
    } else {
      return `openai-${model}`;
    }
  }
  if (isOllamaLLM(model)) {
    return toOllamaModel(model);
  }
  throw new Error(`unknown model: ${model}`);
}

// inverse of model2service, but robust for chat avatars, which might not have a prefix
// TODO: fix the mess
export function service2model(
  service: LanguageService | "chatgpt",
): LanguageModel {
  if (service === "chatgpt") {
    return "gpt-3.5-turbo";
  }
  // split off the first part of service, e.g., "openai-" or "google-"
  const s = service.split("-")[0];
  const hasPrefix = s === "openai" || s === "google";
  const m = hasPrefix ? service.split("-").slice(1).join("-") : service;
  if (!LANGUAGE_MODELS.includes(m as LanguageModel)) {
    // We don't throw an error, since the frontend would crash
    // throw new Error(`unknown service: ${service}`);
    console.warn(`service2model: unknown service: ${service}`);
    return "gpt-3.5-turbo";
  }
  return m as LanguageModel;
}

// Note: this must be an OpenAI model – otherwise change the getValidLanguageModelName function
export const DEFAULT_MODEL: LanguageModel = "gpt-3.5-turbo";

export function model2vendor(model: LanguageModel | string): Vendor {
  if (model.startsWith("gpt-")) {
    return "openai";
  } else if (isOllamaLLM(model)) {
    return "ollama";
  } else {
    return "google";
  }
}

export function toOllamaModel(model: string) {
  if (isOllamaLLM(model)) {
    throw new Error(`already an ollama model: ${model}`);
  }
  return `ollama-${model}`;
}

export function fromOllamaModel(model: string) {
  if (!isOllamaLLM(model)) {
    throw new Error(`not an ollama model: ${model}`);
  }
  return model.slice("ollama-".length);
}

export function isOllamaLLM(model: string) {
  return model.startsWith("ollama-");
}

const MODELS_OPENAI = [
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k",
  "gpt-4",
  "gpt-4-32k",
] as const;

export const MODELS = [
  ...MODELS_OPENAI,
  "text-embedding-ada-002",
  "text-bison-001",
  "chat-bison-001",
  "embedding-gecko-001",
  "gemini-pro",
] as const;

export type Model = (typeof MODELS)[number];

export type ModelOpenAI = (typeof MODELS_OPENAI)[number];

// Map from psuedo account_id to what should be displayed to user.
// This is used in various places in the frontend.
// Google PaLM: https://cloud.google.com/vertex-ai/docs/generative-ai/pricing
export const LLM_USERNAMES = {
  chatgpt: "GPT-3.5",
  chatgpt3: "GPT-3.5",
  chatgpt4: "GPT-4",
  "gpt-4": "GPT-4",
  "gpt-4-32k": "GPT-4-32k",
  "gpt-3.5-turbo": "GPT-3.5",
  "gpt-3.5-turbo-16k": "GPT-3.5-16k",
  "text-bison-001": "PaLM 2",
  "chat-bison-001": "PaLM 2",
  "embedding-gecko-001": "PaLM 2",
  "gemini-pro": "Gemini Pro",
} as const;

export function isFreeModel(model: string) {
  if (isOllamaLLM(model)) return true;
  if (LANGUAGE_MODELS.includes(model as LanguageModel)) {
    // of these models, the following are free
    return (
      (model as Model) == "gpt-3.5-turbo" ||
      (model as Model) == "text-bison-001" ||
      (model as Model) == "chat-bison-001" ||
      (model as Model) == "embedding-gecko-001" ||
      (model as Model) == "gemini-pro"
    );
  }
  // all others are free
  return true;
}

// this is used in purchases/get-service-cost
// we only need to check for the vendor prefixes, no special cases!
export function isLanguageModelService(
  service: Service,
): service is LLMService {
  for (const v of LANGUAGE_MODEL_VENDORS) {
    if (service.startsWith(`${v}-`)) {
      return true;
    }
  }
  return false;
}

export function getVendorStatusCheckMD(vendor: Vendor): string {
  switch (vendor) {
    case "openai":
      return `OpenAI [status](https://status.openai.com) and [downdetector](https://downdetector.com/status/openai).`;
    case "google":
      return `Google [status](https://status.cloud.google.com) and [downdetector](https://downdetector.com/status/google-cloud).`;
    case "ollama":
      return `No status information for Ollama available – you have to check with the particular backend for the model.`;
    default:
      unreachable(vendor);
  }
  return "";
}

export function llmSupportsStreaming(model: LanguageModel): boolean {
  return model2vendor(model) === "openai" || model === "gemini-pro";
}

interface Cost {
  prompt_tokens: number;
  completion_tokens: number;
  max_tokens: number;
}

// This is the official published cost that openai charges.
// It changes over time, so this will sometimes need to be updated.
// Our cost is a configurable multiple of this.
// https://openai.com/pricing#language-models
// There appears to be no api that provides the prices, unfortunately.
const LLM_COST: { [name in LanguageModel]: Cost } = {
  "gpt-4": {
    prompt_tokens: 0.03 / 1000,
    completion_tokens: 0.06 / 1000,
    max_tokens: 8192,
  },
  "gpt-4-32k": {
    prompt_tokens: 0.06 / 1000,
    completion_tokens: 0.12 / 1000,
    max_tokens: 32768,
  },
  "gpt-3.5-turbo": {
    prompt_tokens: 0.0015 / 1000,
    completion_tokens: 0.002 / 1000,
    max_tokens: 4096,
  },
  "gpt-3.5-turbo-16k": {
    prompt_tokens: 0.003 / 1000,
    completion_tokens: 0.004 / 1000,
    max_tokens: 16384,
  },
  "text-embedding-ada-002": {
    prompt_tokens: 0.0001 / 1000,
    completion_tokens: 0.0001 / 1000, // NOTE: this isn't a thing with embeddings
    max_tokens: 8191,
  },
  // https://developers.generativeai.google/models/language
  "text-bison-001": {
    // we assume 5 characters is 1 token on average
    prompt_tokens: (5 * 0.0005) / 1000,
    completion_tokens: (5 * 0.0005) / 1000,
    max_tokens: 8196,
  },
  "chat-bison-001": {
    // we assume 5 characters is 1 token on average
    prompt_tokens: (5 * 0.0005) / 1000,
    completion_tokens: (5 * 0.0005) / 1000,
    max_tokens: 8196,
  },
  "embedding-gecko-001": {
    prompt_tokens: (5 * 0.0001) / 1000,
    completion_tokens: 0,
    max_tokens: 8196, // ???
  },
  "gemini-pro": {
    // https://ai.google.dev/models/gemini
    prompt_tokens: (5 * 0.0001) / 1000,
    completion_tokens: 0,
    max_tokens: 30720,
  },
} as const;

export function isValidModel(model?: string): boolean {
  if (model == null) return false;
  if (isOllamaLLM(model)) return true;
  return LLM_COST[model ?? ""] != null;
}

export function getMaxTokens(model?: Model | string): number {
  return LLM_COST[model ?? ""]?.max_tokens ?? 4096;
}

export interface LLMCost {
  prompt_tokens: number;
  completion_tokens: number;
}

export function getLLMCost(
  model: Model,
  markup_percentage: number, // a number like "30" would mean that we increase the wholesale price by multiplying by 1.3
): LLMCost {
  const x = LLM_COST[model];
  if (x == null) {
    throw Error(`unknown model "${model}"`);
  }
  const { prompt_tokens, completion_tokens } = x;
  if (markup_percentage < 0) {
    throw Error("markup percentage can't be negative");
  }
  const f = 1 + markup_percentage / 100;
  return {
    prompt_tokens: prompt_tokens * f,
    completion_tokens: completion_tokens * f,
  };
}

// The maximum cost for one single call using the given model.
// We can't know the cost until after it happens, so this bound is useful for
// ensuring user can afford to make a call.
export function getMaxCost(model: Model, markup_percentage: number): number {
  const { prompt_tokens, completion_tokens } = getLLMCost(
    model,
    markup_percentage,
  );
  const { max_tokens } = LLM_COST[model];
  return Math.max(prompt_tokens, completion_tokens) * max_tokens;
}
