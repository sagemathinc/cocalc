// this contains bits and pieces from the wrongly named openai.ts file

import type { Service } from "@cocalc/util/db-schema/purchases";
import { unreachable } from "@cocalc/util/misc";

const OPENAI_PREFIX = "openai-";

// NOTE: all arrays of model names should order them by the "simples and fastest" to the "complex, slowest, most expensive"
// that way, the ordering the UI isn't looking arbitrary, but has a clear logic

export const MODELS_OPENAI = [
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k",
  "gpt-4",
  "gpt-4-32k",
  "gpt-4-turbo-preview-8k", // like above, but artificially limited to 8k tokens
  "gpt-4-turbo-preview",
  "text-embedding-ada-002", // TODO: this is for embeddings, should be moved to a different place
] as const;

export type OpenAIModel = (typeof MODELS_OPENAI)[number];

export function isOpenAIModel(model: unknown): model is OpenAIModel {
  return MODELS_OPENAI.includes(model as any);
}

// ATTN: when you modify this list, also change frontend/.../llm/llm-selector.tsx!
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

// google's are taken from here – we use the generative AI client lib
// https://developers.generativeai.google/models/language
// $ curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_GENAI" | jq
export const GOOGLE_MODELS = [
  "gemini-pro",
  "gemini-1.0-ultra-latest", // only works with langchain, not their GenAI JS lib
  "gemini-1.5-pro-latest", // neither works with langchain (yet) nor GenAI JS
] as const;
export type GoogleModel = (typeof GOOGLE_MODELS)[number];
export function isGoogleModel(model: unknown): model is GoogleModel {
  return GOOGLE_MODELS.includes(model as any);
}

// https://docs.anthropic.com/claude/docs/models-overview -- stable names for the modesl ...
export const ANTHROPIC_MODELS = [
  "claude-3-haiku",
  "claude-3-haiku-8k", // limited context window, offered for free
  "claude-3-sonnet",
  "claude-3-sonnet-4k", // limited context window, offered for free
  "claude-3-opus",
] as const;
const CLAUDE_SONNET_VERSION = "20240229";
const CLAUDE_HAIKU_VERSION = "20240307";
const CLAUDE_OPUS_VERSION = "20240229";
// ... and we add a version number (there is no "*-latest") when dispatching on the backend
export const ANTHROPIC_VERSION: { [name in AnthropicModel]: string } = {
  "claude-3-opus": CLAUDE_OPUS_VERSION,
  "claude-3-sonnet": CLAUDE_SONNET_VERSION,
  "claude-3-sonnet-4k": CLAUDE_SONNET_VERSION,
  "claude-3-haiku": CLAUDE_HAIKU_VERSION,
  "claude-3-haiku-8k": CLAUDE_HAIKU_VERSION,
} as const;
export const ANTHROPIC_PREFIX = "anthropic-";
export type AnthropicModel = (typeof ANTHROPIC_MODELS)[number];
type AnthropicService = `${typeof ANTHROPIC_PREFIX}${AnthropicModel}`;
export function isAnthropicModel(model: unknown): model is AnthropicModel {
  return ANTHROPIC_MODELS.includes(model as any);
}
export function toAnthropicService(model: AnthropicModel): AnthropicService {
  return `${ANTHROPIC_PREFIX}${model}`;
}
export function isAnthropicService(
  service: string,
): service is AnthropicService {
  return service.startsWith(ANTHROPIC_PREFIX);
}
export function fromAnthropicService(
  service: AnthropicService,
): AnthropicModel {
  if (!isAnthropicService(service)) {
    throw new Error(`not a mistral service: ${service}`);
  }
  return service.slice(ANTHROPIC_PREFIX.length) as AnthropicModel;
}

// the hardcoded list of available language models – there are also dynamic ones, like OllamaLLM objects
export const LANGUAGE_MODELS = [
  ...MODELS_OPENAI,
  ...MISTRAL_MODELS,
  ...GOOGLE_MODELS,
  ...ANTHROPIC_MODELS,
] as const;

// This hardcodes which models can be selected by users – refine this by setting site_settings.selectable_llms!
// Make sure to update this when adding new models.
// This is used in e.g. mentionable-users.tsx, model-switch.tsx and other-settings.tsx
export const USER_SELECTABLE_LANGUAGE_MODELS = [
  ...MODELS_OPENAI.filter(
    (m) =>
      m !== "gpt-4-32k" && // this one is deliberately not selectable by users!
      m !== "text-embedding-ada-002", // shouldn't be in the list in the first place
  ),
  ...GOOGLE_MODELS.filter(
    (m) => m === "gemini-pro" || m === "gemini-1.0-ultra-latest",
  ),
  ...MISTRAL_MODELS,
  ...ANTHROPIC_MODELS.filter((m) => {
    // we show opus and the restricted models (to avoid high costs)
    return (
      m === "claude-3-opus" ||
      m === "claude-3-sonnet-4k" ||
      m === "claude-3-haiku-8k"
    );
  }),
] as const;

export type OllamaLLM = string;

// use the one without Ollama to get stronger typing. Ollama could be any string starting with the OLLAMA_PREFIX.
export type CoreLanguageModel = (typeof LANGUAGE_MODELS)[number];
export type LanguageModel = CoreLanguageModel | OllamaLLM;

// we check if the given object is any known language model
export function isLanguageModel(model?: unknown): model is LanguageModel {
  if (model == null) return false;
  if (typeof model !== "string") return false;
  if (isOllamaLLM(model)) return true;
  return LANGUAGE_MODELS.includes(model as any);
}

export const LANGUAGE_MODEL_SERVICES = [
  "openai",
  "google",
  "ollama",
  "mistralai", // the "*ai" is deliberately, because their model names start with "mistral-..." and we have to distinguish it from the prefix
  "anthropic",
] as const;
export type LLMServiceName = (typeof LANGUAGE_MODEL_SERVICES)[number];

export type LLMServicesAvailable = Record<LLMServiceName, boolean>;

interface LLMService {
  name: string;
  short: string; // additional short text next to the company name
  desc: string; // more detailed description
}
export const LLM_PROVIDER: { [key in LLMServiceName]: LLMService } = {
  openai: {
    name: "OpenAI",
    short: "AI research and deployment company",
    desc: "OpenAI is an AI research and deployment company. Their mission is to ensure that artificial general intelligence benefits all of humanity.",
  },
  google: {
    name: "Google",
    short: "Technology company",
    desc: "Google's mission is to organize the world's information and make it universally accessible and useful.",
  },
  anthropic: {
    name: "Anthropic",
    short: "AI research company",
    desc: "Anthropic is an American artificial intelligence (AI) startup company, founded by former members of OpenAI.",
  },
  mistralai: {
    name: "Mistral AI",
    short: "French AI company",
    desc: "Mistral AI is a French company selling artificial intelligence (AI) products.",
  },
  ollama: {
    name: "Ollama",
    short: "Open-source software",
    desc: "Ollama helps you to get up and running with large language models, locally.",
  },
};

// this is used in initialization functions. e.g. to get a default model depending on the overall availability
// usually, this should just return the chatgpt3 model, but e.g. if neither google or openai is available,
// then it might even falls back to an available ollama model. It needs to return a string, though, for the frontend, etc.
export function getValidLanguageModelName(
  model: string | undefined,
  filter: LLMServicesAvailable = {
    openai: true,
    google: true,
    ollama: false,
    mistralai: false,
    anthropic: false,
  },
  ollama: string[] = [], // keys of ollama models
  selectable_llms: string[],
): LanguageModel {
  const dftl: string =
    filter.openai === true && selectable_llms.includes(DEFAULT_MODEL)
      ? DEFAULT_MODEL
      : selectable_llms
          .filter((m) => {
            if (filter.openai && isOpenAIModel(m)) return true;
            if (filter.mistralai && isMistralModel(m)) return true;
            if (filter.google && isGoogleModel(m)) return true;
            return false;
          })
          .pop() ??
        (filter.ollama && ollama?.length > 0)
      ? toOllamaModel(ollama[0])
      : DEFAULT_MODEL;

  if (model == null) {
    return dftl;
  }
  if (isOllamaLLM(model) && ollama.includes(fromOllamaModel(model))) {
    return model;
  }
  if (
    typeof model === "string" &&
    isLanguageModel(model) &&
    selectable_llms.includes(model)
  ) {
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
export type MistralService = `${typeof MISTRAL_PREFIX}${MistralModel}`;
export function isMistralService(service: string): service is MistralService {
  return service.startsWith(MISTRAL_PREFIX);
}

const GOOGLE_PREFIX = "google-";

// we encode the in the frontend and elsewhere with the service name as a prefix
// ATTN: don't change the encoding pattern of [vendor]-[model]
//       for whatever reason, it's also described that way in purchases/close.ts
export type LanguageService =
  | `${typeof OPENAI_PREFIX}${OpenAIModel}`
  | `${typeof GOOGLE_PREFIX}${
      | "text-bison-001"
      | "chat-bison-001"
      | "embedding-gecko-001"}`
  | `${typeof GOOGLE_PREFIX}${GoogleModel}`
  | AnthropicService
  | MistralService
  | OllamaService;

// used e.g. for checking "account-id={string}" and other things like that
export const LANGUAGE_MODEL_PREFIXES = [
  "chatgpt",
  ...LANGUAGE_MODEL_SERVICES.map((v) => `${v}-`),
] as const;

// we encode the in the frontend and elsewhere with the service name as a prefix
export function model2service(model: LanguageModel): LanguageService {
  if (model === "text-embedding-ada-002") {
    return `${OPENAI_PREFIX}${model}`;
  }
  if (isOllamaLLM(model)) {
    return model; // already has the ollama prefix
  }
  if (isMistralModel(model)) {
    return toMistralService(model);
  }
  if (isAnthropicModel(model)) {
    return toAnthropicService(model);
  }
  if (isLanguageModel(model)) {
    if (
      model === "text-bison-001" ||
      model === "chat-bison-001" ||
      model === "embedding-gecko-001" ||
      isGoogleModel(model)
    ) {
      return `${GOOGLE_PREFIX}${model}`;
    } else {
      return `${OPENAI_PREFIX}${model}`;
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
  const hasPrefix = LANGUAGE_MODEL_SERVICES.some((v) => s === v);

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

export function model2vendor(model): LLMServiceName {
  if (isOllamaLLM(model)) {
    return "ollama";
  } else if (isMistralModel(model)) {
    return "mistralai";
  } else if (isOpenAIModel(model)) {
    return "openai";
  } else if (isGoogleModel(model)) {
    return "google";
  } else if (isAnthropicModel(model)) {
    return "anthropic";
  }
  throw new Error(`model2vendor: unknown model: "${model}"`);
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
  if (!isMistralModel(model)) {
    throw new Error(`not a mistral model: ${model}`);
  }
  return `${MISTRAL_PREFIX}${model}`;
}

export function fromMistralService(model: MistralService) {
  if (!isMistralService(model)) {
    throw new Error(`not a mistral model: ${model}`);
  }
  return model.slice(MISTRAL_PREFIX.length);
}

type LLM2String = {
  [key in
    | (typeof USER_SELECTABLE_LANGUAGE_MODELS)[number]
    | "chatgpt" // some additional ones, backwards compatibility
    | "chatgpt3"
    | "chatgpt4"
    | "gpt-4-32k"
    | "text-bison-001"
    | "chat-bison-001"]: string;
};

// Map from psuedo account_id to what should be displayed to user.
// This is used in various places in the frontend.
// Google PaLM: https://cloud.google.com/vertex-ai/docs/generative-ai/pricing
export const LLM_USERNAMES: LLM2String = {
  chatgpt: "GPT-3.5",
  chatgpt3: "GPT-3.5",
  chatgpt4: "GPT-4",
  "gpt-4": "GPT-4",
  "gpt-4-32k": "GPT-4-32k",
  "gpt-3.5-turbo": "GPT-3.5",
  "gpt-3.5-turbo-16k": "GPT-3.5-16k",
  "gpt-4-turbo-preview": "GPT-4 Turbo 128k",
  "gpt-4-turbo-preview-8k": "GPT-4 Turbo 8k",
  "text-embedding-ada-002": "Text Embedding Ada 002", // TODO: this is for embeddings, should be moved to a different place
  "text-bison-001": "PaLM 2",
  "chat-bison-001": "PaLM 2",
  "gemini-pro": "Gemini 1.0 Pro",
  "gemini-1.0-ultra-latest": "Gemini 1.0 Ultra",
  "gemini-1.5-pro-latest": "Gemini 1.5 Pro",
  "mistral-small-latest": "Mistral AI Small",
  "mistral-medium-latest": "Mistral AI Medium",
  "mistral-large-latest": "Mistral AI Large",
  "claude-3-haiku": "Claude 3 Haiku",
  "claude-3-haiku-8k": "Claude 3 Haiku 8k",
  "claude-3-sonnet": "Claude 3 Sonnet",
  "claude-3-sonnet-4k": "Claude 3 Sonnet 4k",
  "claude-3-opus": "Claude 3 Opus",
} as const;

// similar to the above, we map to short user-visible description texts
// this comes next to the name, hence you do not have to mention the name
export const LLM_DESCR: LLM2String = {
  chatgpt: "Fast, great for everyday tasks. (OpenAI, 4k token context)",
  chatgpt3: "Fast, great for everyday tasks. (OpenAI, 4k token context)",
  chatgpt4:
    "Can follow complex instructions and solve difficult problems. (OpenAI, 8k token context)",
  "gpt-4":
    "Can follow complex instructions and solve difficult problems. (OpenAI, 8k token context)",
  "gpt-4-32k": "",
  "gpt-3.5-turbo": "Fast, great for everyday tasks. (OpenAI, 4k token context)",
  "gpt-3.5-turbo-16k": `Same as ${LLM_USERNAMES["gpt-3.5-turbo"]} but with larger 16k token context`,
  "gpt-4-turbo-preview-8k":
    "More powerful, fresher knowledge, and lower price than GPT-4. (OpenAI, 8k token context)",
  "gpt-4-turbo-preview":
    "Like GPT-4 Turob 8k, but with up to 128k token context",
  "text-embedding-ada-002": "Text embedding Ada 002 by OpenAI", // TODO: this is for embeddings, should be moved to a different place
  "text-bison-001": "",
  "chat-bison-001": "",
  "gemini-pro":
    "Google's Gemini 1.0 Pro Generative AI model (30k token context)",
  "gemini-1.0-ultra-latest":
    "Google's Gemini 1.0 Ultra Generative AI model (30k token context)",
  "gemini-1.5-pro-latest":
    "Google's Gemini 1.5 Pro Generative AI model (100k token context)",
  "mistral-small-latest":
    "Fast, simple queries, short answers, less capabilities. (Mistral AI, 4k token context)",
  "mistral-medium-latest":
    "Intermediate tasks, summarizing, generating documents, etc. (Mistral AI, 4k token context)",
  "mistral-large-latest":
    "Most powerful, large reasoning capabilities, but slower. (Mistral AI, 4k token context)",
  "claude-3-haiku":
    "Fastest model, lightweight actions (Anthropic, 200k token context)",
  "claude-3-haiku-8k":
    "Fastest model, lightweight actions (Anthropic, 8k token context)",
  "claude-3-sonnet":
    "Best combination of performance and speed (Anthropic, 200k token context)",
  "claude-3-sonnet-4k":
    "Best combination of performance and speed (Anthropic, 4k token context)",
  "claude-3-opus":
    "Most intelligent, complex analysis, higher-order math and coding (Anthropic, 200k token context)",
} as const;

export function isFreeModel(model: unknown, isCoCalcCom: boolean): boolean {
  if (!isCoCalcCom) return true;
  if (isOllamaLLM(model)) return true;
  if (typeof model === "string" && LANGUAGE_MODELS.includes(model as any)) {
    // i.e. model is now of type CoreLanguageModel and
    const costInfo = LLM_COST[model];
    if (costInfo != null) {
      return costInfo.free;
    }
  }
  // all others are free (this should actually never happen, but we're cautious)
  return true;
}

// this is used in purchases/get-service-cost
// we only need to check for the vendor prefixes, no special cases!
export function isLanguageModelService(
  service: Service,
): service is LanguageService {
  for (const v of LANGUAGE_MODEL_SERVICES) {
    if (service.startsWith(`${v}-`)) {
      return true;
    }
  }
  return false;
}

export function getLLMServiceStatusCheckMD(service: LLMServiceName): string {
  switch (service) {
    case "openai":
      return `OpenAI [status](https://status.openai.com) and [downdetector](https://downdetector.com/status/openai).`;
    case "google":
      return `Google [status](https://status.cloud.google.com) and [downdetector](https://downdetector.com/status/google-cloud).`;
    case "ollama":
      return `No status information for Ollama available – you have to check with the particular backend for the model.`;
    case "mistralai":
      return `No status information for Mistral AI available.`;
    case "anthropic":
      return `Anthropic [status](https://status.anthropic.com/).`;
    default:
      unreachable(service);
  }
  return "";
}

interface Cost {
  prompt_tokens: number;
  completion_tokens: number;
  max_tokens: number;
  free: boolean; // whether this model has a metered paid usage, or offered for free
}

// price per token for a given price of USD per 1M tokens
function usd1Mtokens(usd: number): number {
  return usd / 1_000_000;
}

// This is the official published cost that openai charges.
// It changes over time, so this will sometimes need to be updated.
// Our cost is a configurable multiple of this.
// https://openai.com/pricing#language-models
// There appears to be no api that provides the prices, unfortunately.
export const LLM_COST: { [name in CoreLanguageModel]: Cost } = {
  "gpt-4": {
    prompt_tokens: 0.03 / 1000,
    completion_tokens: 0.06 / 1000,
    max_tokens: 8192,
    free: false,
  },
  "gpt-4-32k": {
    prompt_tokens: 0.06 / 1000,
    completion_tokens: 0.12 / 1000,
    max_tokens: 32768,
    free: false,
  },
  "gpt-3.5-turbo": {
    prompt_tokens: usd1Mtokens(1.5),
    completion_tokens: usd1Mtokens(2),
    max_tokens: 4096,
    free: true,
  },
  "gpt-3.5-turbo-16k": {
    prompt_tokens: usd1Mtokens(3),
    completion_tokens: usd1Mtokens(4),
    max_tokens: 16384,
    free: false,
  },
  "gpt-4-turbo-preview": {
    prompt_tokens: usd1Mtokens(10), // 	$10.00 / 1M tokens
    completion_tokens: usd1Mtokens(30), // $30.00 / 1M tokens
    max_tokens: 128000, // This is a lot: blows up the "max cost" calculation → requires raising the minimum balance and quota limit
    free: false,
  },
  // like above, but we limit the tokens to reduce how much money user has to commit to
  "gpt-4-turbo-preview-8k": {
    prompt_tokens: usd1Mtokens(10),
    completion_tokens: usd1Mtokens(30),
    max_tokens: 8192, // the actual reply is 8k, and we use this to truncate the input prompt!
    free: false,
  },
  // also OpenAI
  "text-embedding-ada-002": {
    prompt_tokens: 0.0001 / 1000,
    completion_tokens: 0.0001 / 1000, // NOTE: this isn't a thing with embeddings
    max_tokens: 8191,
    free: false,
  },
  // https://developers.generativeai.google/models/language
  // "text-bison-001": {
  //   // we assume 5 characters is 1 token on average
  //   prompt_tokens: (5 * 0.0005) / 1000,
  //   completion_tokens: (5 * 0.0005) / 1000,
  //   max_tokens: 8196,
  // },
  // "chat-bison-001": {
  //   // we assume 5 characters is 1 token on average
  //   prompt_tokens: (5 * 0.0005) / 1000,
  //   completion_tokens: (5 * 0.0005) / 1000,
  //   max_tokens: 8196,
  // },
  // "embedding-gecko-001": {
  //   prompt_tokens: (5 * 0.0001) / 1000,
  //   completion_tokens: 0,
  //   max_tokens: 8196, // ???
  // },
  // you can learn details about the google models via
  // curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$KEY"
  "gemini-pro": {
    prompt_tokens: usd1Mtokens(1), // TODO: price not yet known!
    completion_tokens: usd1Mtokens(1),
    max_tokens: 30720,
    free: true,
  },
  "gemini-1.0-ultra-latest": {
    prompt_tokens: usd1Mtokens(1), // TODO: price not yet known!
    completion_tokens: usd1Mtokens(1),
    max_tokens: 30720,
    free: true,
  },
  "gemini-1.5-pro-latest": {
    prompt_tokens: usd1Mtokens(1), // TODO: price not yet known!
    completion_tokens: usd1Mtokens(1),
    max_tokens: 1048576,
    free: true,
  },
  "mistral-small-latest": {
    prompt_tokens: usd1Mtokens(2), // 2$ / 1M tokens
    completion_tokens: usd1Mtokens(6), // 6$ / 1M tokens
    max_tokens: 4096, // TODO don't know the real value, see getMaxTokens
    free: true,
  },
  "mistral-medium-latest": {
    prompt_tokens: usd1Mtokens(2.7), // 2.7$ / 1M tokens
    completion_tokens: usd1Mtokens(8.1), // 8.1$ / 1M tokens
    max_tokens: 4096, // TODO don't know the real value, see getMaxTokens
    free: true,
  },
  "mistral-large-latest": {
    prompt_tokens: usd1Mtokens(8), // 8$ / 1M tokens
    completion_tokens: usd1Mtokens(24), // 24$ / 1M tokens
    max_tokens: 4096, // TODO don't know the real value, see getMaxTokens
    free: false,
  },
  // Anthropic: pricing somewhere on that page: https://www.anthropic.com/api
  "claude-3-opus": {
    prompt_tokens: usd1Mtokens(15),
    completion_tokens: usd1Mtokens(75),
    max_tokens: 200_000,
    free: false,
  },
  "claude-3-sonnet": {
    prompt_tokens: usd1Mtokens(3),
    completion_tokens: usd1Mtokens(15),
    max_tokens: 200_000,
    free: false,
  },
  "claude-3-sonnet-4k": {
    prompt_tokens: usd1Mtokens(3),
    completion_tokens: usd1Mtokens(15),
    max_tokens: 4_000, // limited to 4k tokens, offered for free
    free: true,
  },
  "claude-3-haiku": {
    prompt_tokens: usd1Mtokens(0.25),
    completion_tokens: usd1Mtokens(1.25),
    max_tokens: 200_000,
    free: false,
  },
  "claude-3-haiku-8k": {
    prompt_tokens: usd1Mtokens(0.25),
    completion_tokens: usd1Mtokens(1.25),
    max_tokens: 8_000, // limited to 8k tokens, offered for free
    free: true,
  },
} as const;

// TODO: remove this test – it's only used server side, and that server side check should work for all known LLM models
export function isValidModel(model?: string): boolean {
  if (model == null) return false;
  if (isOllamaLLM(model)) return true;
  if (isMistralModel(model)) return true;
  if (isGoogleModel(model)) return true;
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

/**
 * Initially, we just had one system promt for all LLMs.
 * This was tuned for the ChatGPTs by OpenAI, but breaks down for others.
 * For example, Gemini and Mistral are confused by mentioning "CoCalc" and insert code cells for all kinds of questions.
 */
export function getSystemPrompt(
  model: LanguageModel,
  _path: string | undefined,
) {
  // TODO: for now, path is ignored. We might want to use it to customize the prompt in the future.
  const common = "Be brief.";
  const math = "Enclose any math formulas in $.";

  if (model2vendor(model) === "openai" || model.startsWith(OPENAI_PREFIX)) {
    const mdCode =
      "Include the language directly after the triple backticks in all markdown code blocks.";
    return `Assume full access to CoCalc and using CoCalc right now.\n${mdCode}\n${math}\n${common}`;
  }

  // mistral stupidly inserts anything mentioned in the prompt as examples, always.
  if (model2vendor(model) === "mistralai" || model.startsWith(MISTRAL_PREFIX)) {
    return common;
  }

  if (model2vendor(model) === "google" || model.startsWith(GOOGLE_PREFIX)) {
    return `${math}\n${common}`;
  }

  if (model2vendor(model) === "ollama" || model.startsWith(OLLAMA_PREFIX)) {
    return `${math}\n${common}`;
  }

  if (
    model2vendor(model) === "anthropic" ||
    model.startsWith(ANTHROPIC_PREFIX)
  ) {
    return `${math}\n${common}`;
  }

  const mdCode = `Any code blocks in triple backticks should mention the language after the first backticks. For example \`\`\`python\nprint("Hello, World!")\n\`\`\``;
  return `${mdCode}\n${math}\n${common}`;
}
