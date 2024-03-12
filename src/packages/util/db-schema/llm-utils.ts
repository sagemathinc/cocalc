// this contains bits and pieces from the wrongly named openai.ts file

import type { Service } from "@cocalc/util/db-schema/purchases";
import { unreachable } from "@cocalc/util/misc";

const MODELS_OPENAI = [
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k",
  "gpt-4",
  "gpt-4-32k",
] as const;

export type ModelOpenAI = (typeof MODELS_OPENAI)[number];

// ATTN: when you modify this list, also change frontend/.../llm/model-switch.tsx!
export const MISTRAL_MODELS = [
  // yes, all 3 of them have an extra mistral-prefix, on top of the vendor prefix
  "mistral-small-latest",
  "mistral-medium-latest",
  "mistral-large-latest",
] as const;

export type MistralModel = (typeof MISTRAL_MODELS)[number];

export function isMistralModel(model: unknown): model is MistralModel {
  return MISTRAL_MODELS.includes(model as any);
}

// the hardcoded list of available language models – there are also dynamic ones, like OllamaLLM objects
export const LANGUAGE_MODELS = [
  ...MODELS_OPENAI,
  ...MISTRAL_MODELS,
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
export const USER_SELECTABLE_LANGUAGE_MODELS = [
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k",
  "gpt-4",
  "gemini-pro",
  ...MISTRAL_MODELS,
] as const;

export type OllamaLLM = string;

export type LanguageModel = (typeof LANGUAGE_MODELS)[number] | OllamaLLM;

// we check if the given object is any known language model
export function isLanguageModel(model?: unknown): model is LanguageModel {
  if (model == null) return false;
  if (typeof model !== "string") return false;
  if (isOllamaLLM(model)) return true;
  return LANGUAGE_MODELS.includes(model as any);
}

export interface LLMServicesAvailable {
  google: boolean;
  openai: boolean;
  ollama: boolean;
  mistral: boolean;
}

// this is used in initialization functions. e.g. to get a default model depending on the overall availability
// usually, this should just return the chatgpt3 model, but e.g. if neither google or openai is available,
// then it might even falls back to an available ollama model. It needs to return a string, though, for the frontend, etc.
export function getValidLanguageModelName(
  model: string | undefined,
  filter: LLMServicesAvailable = {
    google: true,
    openai: true,
    ollama: false,
    mistral: false,
  },
  ollama: string[] = [], // keys of ollama models
): LanguageModel {
  const dftl =
    filter.openai === true
      ? DEFAULT_MODEL
      : filter.ollama && ollama?.length > 0
      ? toOllamaModel(ollama[0])
      : "chat-bison-001";
  if (model == null) {
    return dftl;
  }
  if (isOllamaLLM(model) && ollama.includes(fromOllamaModel(model))) {
    return model;
  }
  if (typeof model === "string" && isLanguageModel(model)) {
    return model;
  }
  return dftl;
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export type OpenAIMessages = OpenAIMessage[];

export const OLLAMA_PREFIX = "ollama-";
export type OllamaService = string;
export function isOllamaService(service: string): service is OllamaService {
  return isOllamaLLM(service);
}

export const MISTRAL_PREFIX = "mistralai-";
export type MistralService = string;
export function isMistralService(service: string): service is MistralService {
  return service.startsWith(MISTRAL_PREFIX);
}

// we encode the in the frontend and elsewhere with the service name as a prefix
// ATTN: don't change the encoding pattern of [vendor]-[model]
//       for whatever reason, it's also described that way in purchases/close.ts
export type LanguageService =
  | "openai-gpt-3.5-turbo"
  | "openai-gpt-3.5-turbo-16k"
  | "openai-gpt-4"
  | "openai-gpt-4-32k"
  | "openai-text-embedding-ada-002"
  | "google-text-bison-001"
  | "google-chat-bison-001"
  | "google-embedding-gecko-001"
  | "google-gemini-pro"
  | OllamaService
  | MistralService;

export const LANGUAGE_MODEL_VENDORS = [
  "openai",
  "google",
  "ollama",
  "mistralai", // the "*ai" is deliberately, because their model names start with "mistral-..." and we have to distinguish it from the prefix
] as const;
export type LLMVendor = (typeof LANGUAGE_MODEL_VENDORS)[number];

// used e.g. for checking "account-id={string}" and other things like that
export const LANGUAGE_MODEL_PREFIXES = [
  "chatgpt",
  ...LANGUAGE_MODEL_VENDORS.map((v) => `${v}-`),
] as const;

// we encode the in the frontend and elsewhere with the service name as a prefix
export function model2service(model: LanguageModel): LanguageService {
  if (model === "text-embedding-ada-002") {
    return `openai-${model}`;
  }
  if (isOllamaLLM(model)) {
    return toOllamaModel(model);
  }
  if (isMistralModel(model)) {
    return toMistralService(model);
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
  const hasPrefix = LANGUAGE_MODEL_VENDORS.some((v) => s === v);

  const m = hasPrefix ? service.split("-").slice(1).join("-") : service;
  if (hasPrefix && s === "ollama") {
    return toOllamaModel(m);
  }
  if (!LANGUAGE_MODELS.includes(m as any)) {
    // We don't throw an error, since the frontend would crash
    // throw new Error(`unknown service: ${service}`);
    console.warn(`service2model: unknown service: ${service}`);
    return "gpt-3.5-turbo";
  }
  return m as LanguageModel;
}

// Note: this must be an OpenAI model – otherwise change the getValidLanguageModelName function
export const DEFAULT_MODEL: LanguageModel = "gpt-3.5-turbo";

export function model2vendor(model): LLMVendor {
  if (isOllamaLLM(model)) {
    return "ollama";
  } else if (isMistralModel(model)) {
    return "mistralai";
  } else if (model.startsWith("gpt-")) {
    return "openai";
  } else {
    return "google";
  }
}

// wraps the model name in an object that indicates that it's an ollama model
// TODO: maybe it will be necessary at some point to pass in the list of available ollama models
// TODO: in the future, this object will also contain info like the max tokens and other parameters (from the DB)
export function toOllamaModel(model: string): OllamaLLM {
  if (isOllamaLLM(model)) {
    throw new Error(`already an ollama model: ${model}`);
  }
  return `${OLLAMA_PREFIX}${model}`;
}

// unwraps the model name from an object that indicates that it's an ollama model
export function fromOllamaModel(model: OllamaLLM) {
  if (!isOllamaLLM(model)) {
    throw new Error(`not an ollama model: ${model}`);
  }
  return model.slice(OLLAMA_PREFIX.length);
}

export function isOllamaLLM(model: unknown): model is OllamaLLM {
  return (
    typeof model === "string" &&
    model.startsWith(OLLAMA_PREFIX) &&
    model.length > OLLAMA_PREFIX.length
  );
}

export function toMistralService(model: string): MistralService {
  if (isMistralService(model)) {
    throw new Error(`already a mistral model: ${model}`);
  }
  return `${MISTRAL_PREFIX}${model}`;
}

export function fromMistralService(model: MistralService) {
  if (!isMistralService(model)) {
    throw new Error(`not a mistral model: ${model}`);
  }
  return model.slice(MISTRAL_PREFIX.length);
}

// Map from psuedo account_id to what should be displayed to user.
// This is used in various places in the frontend.
// Google PaLM: https://cloud.google.com/vertex-ai/docs/generative-ai/pricing
export const LLM_USERNAMES: {
  [key in
    | (typeof USER_SELECTABLE_LANGUAGE_MODELS)[number]
    | "chatgpt" // some additional ones, backwards compatibility
    | "chatgpt3"
    | "chatgpt4"
    | "gpt-4-32k"
    | "text-bison-001"
    | "chat-bison-001"]: string;
} = {
  chatgpt: "GPT-3.5",
  chatgpt3: "GPT-3.5",
  chatgpt4: "GPT-4",
  "gpt-4": "GPT-4",
  "gpt-4-32k": "GPT-4-32k",
  "gpt-3.5-turbo": "GPT-3.5",
  "gpt-3.5-turbo-16k": "GPT-3.5-16k",
  "text-bison-001": "PaLM 2",
  "chat-bison-001": "PaLM 2",
  "gemini-pro": "Gemini Pro",
  "mistral-small-latest": "Mistral AI Small",
  "mistral-medium-latest": "Mistral AI Medium",
  "mistral-large-latest": "Mistral AI Large",
} as const;

export function isFreeModel(model: unknown) {
  if (isOllamaLLM(model)) return true;
  if (isMistralModel(model)) return true;
  if (LANGUAGE_MODELS.includes(model as any)) {
    // of these models, the following are free
    return (
      (model as LanguageModel) == "gpt-3.5-turbo" ||
      (model as LanguageModel) == "text-bison-001" ||
      (model as LanguageModel) == "chat-bison-001" ||
      (model as LanguageModel) == "embedding-gecko-001" ||
      (model as LanguageModel) == "gemini-pro"
    );
  }
  // all others are free
  return true;
}

// this is used in purchases/get-service-cost
// we only need to check for the vendor prefixes, no special cases!
export function isLanguageModelService(
  service: Service,
): service is LanguageService {
  for (const v of LANGUAGE_MODEL_VENDORS) {
    if (service.startsWith(`${v}-`)) {
      return true;
    }
  }
  return false;
}

export function getVendorStatusCheckMD(vendor: LLMVendor): string {
  switch (vendor) {
    case "openai":
      return `OpenAI [status](https://status.openai.com) and [downdetector](https://downdetector.com/status/openai).`;
    case "google":
      return `Google [status](https://status.cloud.google.com) and [downdetector](https://downdetector.com/status/google-cloud).`;
    case "ollama":
      return `No status information for Ollama available – you have to check with the particular backend for the model.`;
    case "mistralai":
      return `No status information for Mistral AI available.`;
    default:
      unreachable(vendor);
  }
  return "";
}

export function llmSupportsStreaming(model: LanguageModel): boolean {
  return (
    model2vendor(model) === "openai" ||
    model === "gemini-pro" ||
    model2vendor(model) === "mistralai"
  );
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
export const LLM_COST: { [name in string]: Cost } = {
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
  if (isMistralModel(model)) return true;
  return LLM_COST[model ?? ""] != null;
}

export function getMaxTokens(model?: LanguageModel): number {
  // TODO: store max tokens in the model object itself, this is just a fallback
  if (isOllamaLLM(model)) return 8192;
  if (isMistralModel(model)) return 4096; // TODO: check with MistralAI
  return LLM_COST[model ?? ""]?.max_tokens ?? 4096;
}

export interface LLMCost {
  prompt_tokens: number;
  completion_tokens: number;
}

export function getLLMCost(
  model: LanguageModel,
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
export function getMaxCost(
  model: LanguageModel,
  markup_percentage: number,
): number {
  const { prompt_tokens, completion_tokens } = getLLMCost(
    model,
    markup_percentage,
  );
  const { max_tokens } = LLM_COST[model];
  return Math.max(prompt_tokens, completion_tokens) * max_tokens;
}
