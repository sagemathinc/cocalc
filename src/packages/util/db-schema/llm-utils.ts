// this contains bits and pieces from the wrongly named openai.ts file

import { isEmpty } from "lodash";
import LRU from "lru-cache";

import { unreachable } from "@cocalc/util/misc";

// these can be defined by admins and users
export const SERVICES = [
  "openai",
  "google",
  "mistralai", // the "*ai" is deliberately, because their model names start with "mistral-..." and we have to distinguish it from the prefix
  "anthropic",
  "ollama",
  "custom_openai",
  "xai",
] as const;

// a "user-*" model is a wrapper for all the model services
export const LANGUAGE_MODEL_SERVICES = [...SERVICES, "user"] as const;

export type UserDefinedLLMService = (typeof SERVICES)[number];

export function isUserDefinedModelType(
  model: unknown,
): model is UserDefinedLLMService {
  return SERVICES.includes(model as any);
}

// "User LLMs" are defined in the user's account settings.
// They query an external LLM service of given type, endpoint, and API key.
export interface UserDefinedLLM {
  id: number; // a unique number
  service: UserDefinedLLMService;
  model: string; // non-empty string
  display: string; // short user-visible string
  endpoint: string; // URL to the LLM service
  apiKey: string;
  icon?: string; // https://.../...png
}

export const USER_LLM_PREFIX = "user-";

// This basically prefixes the "model" defined by the user with the USER and service prefix.
// We do not use the to*() functions, because the names of the models could be arbitrary – for each service
export function toUserLLMModelName(llm: UserDefinedLLM) {
  const { service } = llm;
  const model: string = (() => {
    switch (service) {
      case "custom_openai":
        return `${CUSTOM_OPENAI_PREFIX}${llm.model}`;
      case "ollama":
        return toOllamaModel(llm.model);
      case "anthropic":
        return `${ANTHROPIC_PREFIX}${llm.model}`;
      case "google":
        return `${GOOGLE_PREFIX}${llm.model}`;
      case "mistralai":
        return `${MISTRAL_PREFIX}${llm.model}`;
      case "openai":
        return `${OPENAI_PREFIX}${llm.model}`;
      case "xai":
        return `${XAI_PREFIX}${llm.model}`;
      default:
        unreachable(service);
        throw new Error(
          `toUserLLMModelName of service ${service} not supported`,
        );
    }
  })();
  return `${USER_LLM_PREFIX}${model}`;
}

export function fromUserDefinedLLMModel(m: string): string | null {
  if (isUserDefinedModel(m)) {
    return m.slice(USER_LLM_PREFIX.length);
  }
  return null;
}

export function isUserDefinedModel(model: unknown): boolean {
  if (typeof model !== "string") return false;
  if (model.startsWith(USER_LLM_PREFIX)) {
    const m2 = model.slice(USER_LLM_PREFIX.length);
    return SERVICES.some((svc) => m2.startsWith(`${svc}-`));
  }
  return false;
}

export function unpackUserDefinedLLMModel(model: string): {
  service: UserDefinedLLMService;
  model: string;
} | null {
  const um = fromUserDefinedLLMModel(model);
  if (um === null) return null;
  for (const service of SERVICES) {
    if (um.startsWith(`${service}-`)) {
      return { service, model: um.slice(service.length + 1) };
    }
  }
  return null;
}

export const OPENAI_PREFIX = "openai-";

// NOTE: all arrays of model names should order them by the "simples and fastest" to the "complex, slowest, most expensive"
// that way, the ordering the UI isn't looking arbitrary, but has a clear logic

export const MODELS_OPENAI = [
  "gpt-3.5-turbo",
  "gpt-4o-mini-8k", // context limited
  "gpt-4o-mini", // Released 2024-07-18
  "gpt-4o-8k", // context limited, similar to gpt-4-turbo-8k
  "gpt-4o", // Released 2024-05-13
  // the "preview" variants are disabled, because the preview is over
  "gpt-4-turbo-preview-8k", // like below, but artificially limited to 8k tokens
  "gpt-4-turbo-preview",
  "gpt-4-turbo-8k", // Released 2024-04-11
  "gpt-4-turbo",
  "gpt-4",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4-32k",
  "gpt-3.5-turbo-16k",
  "text-embedding-ada-002", // TODO: this is for embeddings, should be moved to a different place
  "o1-mini-8k",
  "o1-mini",
  "o1-8k",
  "o1",
  "o3-8k", // context limited
  "o3",
  "o4-mini-8k", // context limited
  "o4-mini",
  "gpt-5-8k", // context limited
  "gpt-5",
  "gpt-5.2-8k", // context limited
  "gpt-5.2",
  "gpt-5-mini-8k", // context limited
  "gpt-5-mini",
] as const;

export type OpenAIModel = (typeof MODELS_OPENAI)[number];

export function isOpenAIModel(model: unknown): model is OpenAIModel {
  return MODELS_OPENAI.includes(model as any);
}

// ATTN: when you modify this list, also change frontend/.../llm/llm-selector.tsx!
export const MISTRAL_MODELS = [
  // yes, all of them have an extra mistral-prefix, on top of the vendor prefix
  "mistral-small-latest",
  "mistral-medium-latest",
  "mistral-large-latest",
  "devstral-medium-2507",
  // "magistral-medium-latest", // throws error
] as const;

export type MistralModel = (typeof MISTRAL_MODELS)[number];

export function isMistralModel(model: unknown): model is MistralModel {
  return MISTRAL_MODELS.includes(model as any);
}

// google's are taken from here – we use the generative AI client lib
// https://developers.generativeai.google/models/language
// $ curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_GENAI" | jq
export const GOOGLE_MODELS = [
  "gemini-1.5-flash-8k", // introduced 2024-05-15
  "gemini-1.5-flash", // for user defined models
  "gemini-pro", // Discontinued Feb'25. Keep it to avoid breaking old references!
  "gemini-1.0-ultra", // hangs
  "gemini-1.5-pro-8k", // works now with langchaing
  "gemini-1.5-pro", // works now with langchaing
  "gemini-2.5-flash-8k",
  "gemini-2.5-pro-8k",
  "gemini-2.0-flash-8k",
  "gemini-2.0-flash-lite-8k",
  "gemini-3-flash-preview-16k", // Preview model, context limited to 16k
  "gemini-3-pro-preview-8k", // Preview model, context limited to 8k
] as const;
export type GoogleModel = (typeof GOOGLE_MODELS)[number];
export function isGoogleModel(model: unknown): model is GoogleModel {
  return GOOGLE_MODELS.includes(model as any);
}
export const GOOGLE_MODEL_TO_ID: Partial<{ [m in GoogleModel]: string }> = {
  "gemini-1.5-pro": "gemini-1.5-pro-latest",
  "gemini-1.5-pro-8k": "gemini-1.5-pro-latest",
  "gemini-1.5-flash-8k": "gemini-1.5-flash-latest",
  "gemini-2.0-flash-8k": "gemini-2.0-flash",
  "gemini-2.0-flash-lite-8k": "gemini-2.0-flash-lite",
  "gemini-2.5-flash-8k": "gemini-2.5-flash",
  "gemini-2.5-pro-8k": "gemini-2.5-pro",
  "gemini-3-flash-preview-16k": "gemini-3-flash-preview",
  "gemini-3-pro-preview-8k": "gemini-3-pro-preview",
} as const;

// https://docs.anthropic.com/en/docs/about-claude/models/overview -- stable names for the modesl ...
export const ANTHROPIC_MODELS = [
  "claude-3-5-sonnet",
  "claude-3-5-sonnet-4k", // added 2024-06-24
  "claude-3-5-haiku-8k",
  "claude-3-haiku",
  "claude-3-haiku-8k", // limited context window, offered for free
  "claude-3-sonnet",
  "claude-3-sonnet-4k", // limited context window, offered for free
  "claude-3-opus",
  "claude-3-opus-8k", // same issue as the large GPT models, limit the context window to limit spending
  "claude-4-sonnet-8k",
  "claude-4-opus-8k",
  "claude-4-5-sonnet-8k", // added 2025
  "claude-4-5-opus-8k", // added 2025
  "claude-4-5-haiku-8k", // added 2025
] as const;
// https://docs.anthropic.com/en/docs/about-claude/models/overview#model-aliases
// if it points to null, the model is no longer supported
export const ANTHROPIC_VERSION: { [name in AnthropicModel]: string | null } = {
  "claude-3-5-sonnet": "claude-3-5-sonnet-latest",
  "claude-3-5-sonnet-4k": "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-8k": "claude-3-5-haiku-latest",
  "claude-3-haiku": "claude-3-haiku-20240307",
  "claude-3-haiku-8k": "claude-3-haiku-20240307",
  "claude-4-sonnet-8k": "claude-sonnet-4-0",
  "claude-4-opus-8k": "claude-opus-4-0",
  "claude-4-5-sonnet-8k": "claude-sonnet-4-5",
  "claude-4-5-opus-8k": "claude-opus-4-5",
  "claude-4-5-haiku-8k": "claude-haiku-4-5",
  "claude-3-sonnet": null,
  "claude-3-sonnet-4k": null,
  "claude-3-opus": null,
  "claude-3-opus-8k": null,
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

// xAI (https://x.ai/)
export const XAI_MODELS = [
  "grok-4-1-fast-non-reasoning-16k",
  "grok-4-1-fast-reasoning-16k",
  "grok-code-fast-1-16k",
] as const;
export const XAI_MODEL_TO_ID: Partial<{ [m in XaiModel]: string }> = {
  "grok-4-1-fast-non-reasoning-16k": "grok-4-1-fast-non-reasoning",
  "grok-4-1-fast-reasoning-16k": "grok-4-1-fast-reasoning",
  "grok-code-fast-1-16k": "grok-code-fast-1",
};
export const XAI_PREFIX = "xai-";
export type XaiModel = (typeof XAI_MODELS)[number];
export type XaiService = `${typeof XAI_PREFIX}${XaiModel}`;
export function isXaiModel(model: unknown): model is XaiModel {
  return XAI_MODELS.includes(model as any);
}
export function toXaiService(model: XaiModel): XaiService {
  return `${XAI_PREFIX}${model}`;
}
export function isXaiService(service: string): service is XaiService {
  return service.startsWith(XAI_PREFIX);
}
export function fromXaiService(service: XaiService): XaiModel {
  if (!isXaiService(service)) {
    throw new Error(`not an xai service: ${service}`);
  }
  return service.slice(XAI_PREFIX.length) as XaiModel;
}
export function toXaiProviderModel(model: string): string {
  const mapped = XAI_MODEL_TO_ID[model as XaiModel];
  if (mapped != null) {
    return mapped;
  }
  return model.replace(/-\d+k$/, "");
}

// the hardcoded list of available language models – there are also dynamic ones, like OllamaLLM objects
export const LANGUAGE_MODELS = [
  ...MODELS_OPENAI,
  ...MISTRAL_MODELS,
  ...GOOGLE_MODELS,
  ...ANTHROPIC_MODELS,
  ...XAI_MODELS,
] as const;

export const USER_SELECTABLE_LLMS_BY_VENDOR: {
  [vendor in LLMServiceName]: Readonly<LanguageModelCore[]>;
} = {
  openai: MODELS_OPENAI.filter(
    (m) =>
      m === "gpt-4" ||
      m === "gpt-4-turbo-preview-8k" ||
      m === "gpt-4o-8k" ||
      m === "gpt-4o-mini-8k" ||
      m === "gpt-4.1" ||
      m === "gpt-4.1-mini" ||
      m === "o3-8k" ||
      m === "o4-mini-8k" ||
      m === "gpt-5.2-8k" ||
      m === "gpt-5-mini-8k",
  ),
  google: [
    "gemini-3-flash-preview-16k",
    "gemini-3-pro-preview-8k",
    "gemini-2.5-flash-8k",
    "gemini-2.5-pro-8k",
  ],
  mistralai: MISTRAL_MODELS.filter((m) => m !== "mistral-small-latest"),
  anthropic: ANTHROPIC_MODELS.filter((m) => {
    // we show opus and the context restricted models (to avoid high costs)
    return (
      m === "claude-4-5-sonnet-8k" ||
      m === "claude-4-5-opus-8k" ||
      m === "claude-4-5-haiku-8k"
    );
  }),
  ollama: [], // this is empty, because these models are not hardcoded
  custom_openai: [], // this is empty, because these models are not hardcoded]
  xai: XAI_MODELS, // all xAI models are user-selectable
  user: [],
} as const;

// This hardcodes which models can be selected by users – refine this by setting site_settings.selectable_llms!
// Make sure to update this when adding new models.
// This is used in e.g. mentionable-users.tsx, model-switch.tsx and other-settings.tsx
export const USER_SELECTABLE_LANGUAGE_MODELS = [
  ...USER_SELECTABLE_LLMS_BY_VENDOR.openai,
  ...USER_SELECTABLE_LLMS_BY_VENDOR.google,
  ...USER_SELECTABLE_LLMS_BY_VENDOR.mistralai,
  ...USER_SELECTABLE_LLMS_BY_VENDOR.anthropic,
  ...USER_SELECTABLE_LLMS_BY_VENDOR.xai,
] as const;

export type OllamaLLM = string;
export type CustomOpenAI = string;

// use the one without Ollama to get stronger typing. Ollama could be any string starting with the OLLAMA_PREFIX.
export type LanguageModelCore = (typeof LANGUAGE_MODELS)[number];
export type LanguageModel = LanguageModelCore | OllamaLLM;
export function isCoreLanguageModel(
  model: unknown,
): model is LanguageModelCore {
  if (typeof model !== "string") return false;
  return LANGUAGE_MODELS.includes(model as any);
}

// we check if the given object is any known language model
export function isLanguageModel(model?: unknown): model is LanguageModel {
  if (model == null) return false;
  if (typeof model !== "string") return false;
  if (isOllamaLLM(model)) return true;
  if (isCustomOpenAI(model)) return true;
  if (isUserDefinedModel(model)) return true; // this also checks, if there is a valid model inside
  return LANGUAGE_MODELS.includes(model as any);
}

export type LLMServiceName = (typeof LANGUAGE_MODEL_SERVICES)[number];

export function isLLMServiceName(service: unknown): service is LLMServiceName {
  if (typeof service !== "string") return false;
  return LANGUAGE_MODEL_SERVICES.includes(service as any);
}

export type LLMServicesAvailable = Record<LLMServiceName, boolean>;

interface LLMService {
  name: string;
  short: string; // additional short text next to the company name
  desc: string; // more detailed description
  url: string;
}

export const LLM_PROVIDER: { [key in LLMServiceName]: LLMService } = {
  openai: {
    name: "OpenAI",
    short: "AI research and deployment company",
    desc: "OpenAI is an AI research and deployment company. Their mission is to ensure that artificial general intelligence benefits all of humanity.",
    url: "https://openai.com/",
  },
  google: {
    name: "Google",
    short: "Technology company",
    desc: "Google's mission is to organize the world's information and make it universally accessible and useful.",
    url: "https://gemini.google.com/",
  },
  anthropic: {
    name: "Anthropic",
    short: "AI research company",
    desc: "Anthropic is an American artificial intelligence (AI) startup company, founded by former members of OpenAI.",
    url: "https://www.anthropic.com/",
  },
  mistralai: {
    name: "Mistral AI",
    short: "French AI company",
    desc: "Mistral AI is a French company selling artificial intelligence (AI) products.",
    url: "https://mistral.ai/",
  },
  ollama: {
    name: "Ollama",
    short: "Open-source software",
    desc: "Ollama language model server at a custom API endpoint.",
    url: "https://ollama.com/",
  },
  custom_openai: {
    name: "OpenAI API",
    short: "Custom endpoint",
    desc: "Calls a custom OpenAI API endoint.",
    url: "https://js.langchain.com/v0.1/docs/integrations/llms/openai/",
  },
  xai: {
    name: "xAI",
    short: "AI company by X Corp",
    desc: "xAI is an American artificial intelligence company founded by Elon Musk.",
    url: "https://x.ai/",
  },
  user: {
    name: "User Defined",
    short: "Account → Language Model",
    desc: "Defined by the user in Account Settings → Language Model",
    url: "",
  },
} as const;

interface ValidLanguageModelNameProps {
  model: string | undefined;
  filter: LLMServicesAvailable;
  ollama: string[]; // keys of ollama models
  custom_openai: string[]; // keys of custom openai models
  selectable_llms: string[]; // either empty, or an array stored in the server settings
}

// NOTE: these values must be in sync with the "no" vals in db-schema/site-defaults.ts
const DEFAULT_FILTER: Readonly<LLMServicesAvailable> = {
  openai: false,
  google: false,
  ollama: false,
  mistralai: false,
  anthropic: false,
  custom_openai: false,
  xai: false,
  user: false,
} as const;

// this is used in initialization functions. e.g. to get a default model depending on the overall availability
// usually, this should just return the chatgpt3 model, but e.g. if neither google or openai is available,
// then it might even falls back to an available ollama model. It needs to return a string, though, for the frontend, etc.
export function getValidLanguageModelName({
  model,
  filter = DEFAULT_FILTER,
  ollama,
  custom_openai,
  selectable_llms,
}: ValidLanguageModelNameProps): LanguageModel {
  if (typeof model === "string" && isValidModel(model)) {
    try {
      if (isCoreLanguageModel(model)) {
        const v = model2vendor(model).name;
        if (filter[v] && selectable_llms.includes(model)) {
          return model;
        }
      }

      if (isOllamaLLM(model) && ollama.includes(fromOllamaModel(model))) {
        return model;
      }

      if (
        isCustomOpenAI(model) &&
        custom_openai.includes(fromCustomOpenAIModel(model))
      ) {
        return model;
      }

      if (isUserDefinedModel(model)) {
        return model;
      }
    } catch {}
  }

  for (const free of [true, false]) {
    const dflt = getDefaultLLM(
      selectable_llms,
      filter,
      ollama,
      custom_openai,
      free,
    );
    if (dflt != null) {
      return dflt;
    }
  }
  return DEFAULT_MODEL;
}

export const DEFAULT_LLM_PRIORITY: Readonly<UserDefinedLLMService[]> = [
  "google",
  "openai",
  "anthropic",
  "mistralai",
  "xai",
  "ollama",
  "custom_openai",
] as const;

export function getDefaultLLM(
  selectable_llms: string[],
  filter: LLMServicesAvailable,
  ollama?: { [key: string]: any },
  custom_openai?: { [key: string]: any },
  only_free = true,
): LanguageModel {
  for (const v of DEFAULT_LLM_PRIORITY) {
    if (!filter[v]) continue;
    for (const m of USER_SELECTABLE_LLMS_BY_VENDOR[v]) {
      if (selectable_llms.includes(m)) {
        const isFree = LLM_COST[m].free ?? true;
        if ((only_free && isFree) || !only_free) {
          return m;
        }
      }
    }
  }
  // none of the standard models, pick the first ollama or custom_openai
  if (ollama != null && !isEmpty(ollama)) {
    return toOllamaModel(Object.keys(ollama)[0]);
  }
  if (custom_openai != null && !isEmpty(custom_openai)) {
    return toCustomOpenAIModel(Object.keys(custom_openai)[0]);
  }
  return DEFAULT_MODEL;
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

export const CUSTOM_OPENAI_PREFIX = "custom_openai-";
export type CustomOpenAIService = string;
export function isCustomOpenAIService(
  service: string,
): service is CustomOpenAIService {
  return isCustomOpenAI(service);
}

export const MISTRAL_PREFIX = "mistralai-";
export type MistralService = `${typeof MISTRAL_PREFIX}${MistralModel}`;
export function isMistralService(service: string): service is MistralService {
  return service.startsWith(MISTRAL_PREFIX);
}

export const GOOGLE_PREFIX = "google-";

// we encode the in the frontend and elsewhere with the service name as a prefix
// ATTN: don't change the encoding pattern of [vendor]-[model]
//       for whatever reason, it's also described that way in purchases/close.ts
export type LanguageServiceCore =
  | `${typeof OPENAI_PREFIX}${OpenAIModel}`
  | `${typeof GOOGLE_PREFIX}${
      | "text-bison-001"
      | "chat-bison-001"
      | "embedding-gecko-001"}`
  | `${typeof GOOGLE_PREFIX}${GoogleModel}`
  | AnthropicService
  | MistralService
  | XaiService;

export type LanguageService =
  | LanguageServiceCore
  | OllamaService
  | CustomOpenAIService;

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
  if (
    isOllamaLLM(model) ||
    isCustomOpenAI(model) ||
    isUserDefinedModel(model)
  ) {
    return model; // already has a useful prefix
  }
  if (isXaiModel(model)) {
    return toXaiService(model);
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
  const lm = service2model_core(service);
  if (lm == null) {
    // We don't throw an error, since the frontend would crash
    // throw new Error(`unknown service: ${service}`);
    console.warn(`service2model: unknown service: ${service}`);
    return "gpt-3.5-turbo";
  }
  return lm;
}

export function service2model_core(
  service: LanguageService,
): LanguageModel | null {
  // split off the first part of service, e.g., "openai-" or "google-"
  const s = service.split("-")[0];
  const hasPrefix = LANGUAGE_MODEL_SERVICES.some((v) => s === v);

  if (isUserDefinedModel(service)) {
    return service;
  }

  const m = hasPrefix ? service.split("-").slice(1).join("-") : service;
  if (hasPrefix) {
    // we add the trailing "-" to match with these prefixes, which include the "-"
    switch (`${s}-`) {
      case OLLAMA_PREFIX:
        return toOllamaModel(m);
      case CUSTOM_OPENAI_PREFIX:
        return toCustomOpenAIModel(m);
    }
  }

  if (LANGUAGE_MODELS.includes(m as any)) {
    return m;
  }
  return null;
}

// NOTE: do not use this – instead use server_settings.default_llm
export const DEFAULT_MODEL: LanguageModel = "gemini-3-flash-preview-16k";

interface LLMVendor {
  name: LLMServiceName;
  url: string;
}

export function model2vendor(model): LLMVendor {
  if (isUserDefinedModel(model)) {
    return { name: "user", url: "" };
  } else if (isOllamaLLM(model)) {
    return { name: "ollama", url: LLM_PROVIDER.ollama.url };
  } else if (isCustomOpenAI(model)) {
    return {
      name: "custom_openai",
      url: LLM_PROVIDER.custom_openai.url,
    };
  } else if (isMistralModel(model)) {
    return { name: "mistralai", url: LLM_PROVIDER.mistralai.url };
  } else if (isOpenAIModel(model)) {
    return { name: "openai", url: LLM_PROVIDER.openai.url };
  } else if (isGoogleModel(model)) {
    return { name: "google", url: LLM_PROVIDER.google.url };
  } else if (isAnthropicModel(model)) {
    return { name: "anthropic", url: LLM_PROVIDER.anthropic.url };
  } else if (isXaiModel(model)) {
    return { name: "xai", url: LLM_PROVIDER.xai.url };
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

export function toCustomOpenAIModel(model: string): CustomOpenAI {
  if (isCustomOpenAI(model)) {
    throw new Error(`already a custom openai model: ${model}`);
  }
  return `${CUSTOM_OPENAI_PREFIX}${model}`;
}

export function isCustomOpenAI(model: unknown): model is CustomOpenAI {
  return (
    typeof model === "string" &&
    model.startsWith(CUSTOM_OPENAI_PREFIX) &&
    model.length > CUSTOM_OPENAI_PREFIX.length
  );
}

export function fromCustomOpenAIModel(model: CustomOpenAI) {
  if (!isCustomOpenAI(model)) {
    throw new Error(`not a custom openai model: ${model}`);
  }
  return model.slice(CUSTOM_OPENAI_PREFIX.length);
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
  "gpt-4-turbo-preview-8k": "GPT-4 Turbo",
  "gpt-4-turbo": "GPT-4 Turbo 128k",
  "gpt-4-turbo-8k": "GPT-4 Turbo",
  "gpt-4o": "GPT-4o 128k",
  "gpt-4o-8k": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini 128k",
  "gpt-4o-mini-8k": "GPT-4o Mini",
  "gpt-4.1": "GPT-4.1",
  "gpt-4.1-mini": "GPT-4.1 Mini",
  "o1-mini-8k": "OpenAI o1-mini",
  "o1-8k": "OpenAI o1",
  "o1-mini": "OpenAI o1-mini",
  o1: "OpenAI o1",
  "text-embedding-ada-002": "Text Embedding Ada 002", // TODO: this is for embeddings, should be moved to a different place
  "text-bison-001": "PaLM 2",
  "chat-bison-001": "PaLM 2",
  "gemini-pro": "Gemini 1.0 Pro",
  "gemini-1.0-ultra": "Gemini 1.0 Ultra",
  "gemini-1.5-flash": "Gemini 1.5 Flash",
  "gemini-1.5-pro": "Gemini 1.5 Pro 1m",
  "gemini-1.5-pro-8k": "Gemini 1.5 Pro",
  "gemini-1.5-flash-8k": "Gemini 1.5 Flash",
  "gemini-2.0-flash-8k": "Gemini 2.0 Flash",
  "gemini-2.0-flash-lite-8k": "Gemini 2.0 Flash Lite",
  "gemini-2.5-flash-8k": "Gemini 2.5 Flash",
  "gemini-2.5-pro-8k": "Gemini 2.5 Pro",
  "gemini-3-pro-preview-8k": "Gemini 3 Pro",
  "mistral-small-latest": "Mistral AI Small",
  "mistral-medium-latest": "Mistral AI Medium",
  "mistral-large-latest": "Mistral AI Large",
  "devstral-medium-2507": "Devstral Medium",
  //"magistral-medium-latest": "Magistral Medium",
  "claude-3-haiku": "Claude 3 Haiku",
  "claude-3-haiku-8k": "Claude 3 Haiku",
  "claude-3-5-haiku-8k": "Claude 3 Haiku",
  "claude-3-sonnet": "Claude 3 Sonnet 200k",
  "claude-3-sonnet-4k": "Claude 3 Sonnet",
  "claude-3-5-sonnet": "Claude 3.5 Sonnet",
  "claude-3-5-sonnet-4k": "Claude 3.5 Sonnet",
  "claude-4-sonnet-8k": "Claude 4 Sonnet",
  "claude-4-opus-8k": "Claude 4 Opus",
  "claude-4-5-sonnet-8k": "Claude 4.5 Sonnet",
  "claude-4-5-opus-8k": "Claude 4.5 Opus",
  "claude-4-5-haiku-8k": "Claude 4.5 Haiku",
  "claude-3-opus": "Claude 3 Opus",
  "claude-3-opus-8k": "Claude 3 Opus",
  "o3-8k": "OpenAI o3",
  o3: "OpenAI o3 128k",
  "o4-mini-8k": "OpenAI o4-mini",
  "o4-mini": "OpenAI o4-mini 128k",
  "gpt-5-8k": "GPT-5",
  "gpt-5": "GPT-5 128k",
  "gpt-5.2-8k": "GPT-5.2",
  "gpt-5.2": "GPT-5.2 128k",
  "gpt-5-mini-8k": "GPT-5 Mini",
  "gpt-5-mini": "GPT-5 Mini 128k",
  "gemini-3-flash-preview-16k": "Gemini 3 Flash",
  "grok-4-1-fast-non-reasoning-16k": "Grok 4.1 Fast",
  "grok-4-1-fast-reasoning-16k": "Grok 4.1 Fast Reasoning",
  "grok-code-fast-1-16k": "Grok Code Fast",
} as const;

// similar to the above, we map to short user-visible description texts
// this comes next to the name, hence you do not have to mention the name
export const LLM_DESCR: LLM2String = {
  chatgpt: "Fast, great for everyday tasks. (OpenAI, 4k token context)",
  chatgpt3: "Fast, great for everyday tasks. (OpenAI, 4k token context)",
  chatgpt4:
    "Can follow complex instructions and solve difficult problems. (OpenAI, 8k token context)",
  "gpt-4":
    "Powerful OpenAI model. Can follow complex instructions and solve difficult problems. (OpenAI, 8k token context)",
  "gpt-4.1":
    "Powerful OpenAI model. Can follow complex instructions and solve difficult problems. (OpenAI, 8k token context)",
  "gpt-4-32k": "",
  "gpt-3.5-turbo": "Fast, great for everyday tasks. (OpenAI, 4k token context)",
  "gpt-3.5-turbo-16k": `Same as ${LLM_USERNAMES["gpt-3.5-turbo"]} but with larger 16k token context`,
  "gpt-4-turbo-preview-8k":
    "More powerful, fresher knowledge, and lower price than GPT-4. (OpenAI, 8k token context)",
  "gpt-4-turbo-preview": "Like GPT-4 Turbo, but with up to 128k token context",
  "gpt-4-turbo-8k":
    "Faster, fresher knowledge, and lower price than GPT-4. (OpenAI, 8k token context)",
  "gpt-4-turbo": "Like GPT-4 Turbo, but with up to 128k token context",
  "gpt-4o-8k":
    "Most powerful, fastest, and cheapest (OpenAI, 8k token context)",
  "gpt-4o": "Most powerful fastest, and cheapest (OpenAI, 128k token context)",
  "gpt-4o-mini-8k":
    "Most cost-efficient small model (OpenAI, 8k token context)",
  "gpt-4.1-mini": "Most cost-efficient small model (OpenAI, 8k token context)",
  "gpt-4o-mini": "Most cost-efficient small model (OpenAI, 128k token context)",
  "text-embedding-ada-002": "Text embedding Ada 002 by OpenAI", // TODO: this is for embeddings, should be moved to a different place
  "o1-8k": "Spends more time thinking (8k token context)",
  "o1-mini-8k": "A cost-efficient reasoning model (8k token context)",
  o1: "Spends more time thinking (8k token context)",
  "o1-mini": "A cost-efficient reasoning model (8k token context)",
  "text-bison-001": "",
  "chat-bison-001": "",
  "gemini-pro":
    "Google's Gemini 1.0 Pro Generative AI model (30k token context)",
  "gemini-1.0-ultra":
    "Google's Gemini 1.0 Ultra Generative AI model (30k token context)",
  "gemini-1.5-pro":
    "Google's Gemini 1.5 Pro Generative AI model (1m token context)",
  "gemini-1.5-flash": "Google's Gemini 1.5 Flash Generative AI model",
  "gemini-1.5-pro-8k":
    "Google's Gemini 1.5 Pro Generative AI model (8k token context)",
  "gemini-1.5-flash-8k":
    "Google's Gemini 1.5 Flash Generative AI model (8k token context)",
  "gemini-2.0-flash-8k":
    "Google's Gemini 2.0 Flash Generative AI model (8k token context)",
  "gemini-2.0-flash-lite-8k":
    "Google's Gemini 2.0 Flash Lite Generative AI model (8k token context)",
  "gemini-2.5-flash-8k":
    "Google's Gemini 2.5 Flash Generative AI model (8k token context)",
  "gemini-2.5-pro-8k":
    "Google's Gemini 2.5 Pro Generative AI model (8k token context)",
  "gemini-3-pro-preview-8k":
    "Google's Gemini 3 Pro Generative AI model (8k token context)",
  "mistral-small-latest":
    "Small general purpose tasks, text classification, customer service. (Mistral AI, 4k token context)",
  "mistral-medium-latest":
    "Intermediate tasks, summarizing, generating documents, etc. (Mistral AI, 4k token context)",
  "mistral-large-latest":
    "Most powerful, large reasoning capabilities, but slower. (Mistral AI, 4k token context)",
  "devstral-medium-2507":
    "Developer-focused model optimized for coding tasks. (Mistral AI, 8k token context)",
  // "magistral-medium-latest":
  //   "Enhanced medium model with improved reasoning capabilities. (Mistral AI, 8k token context)",
  "claude-3-haiku":
    "Fastest model, lightweight actions (Anthropic, 200k token context)",
  "claude-3-haiku-8k":
    "Fastest model, lightweight actions (Anthropic, 8k token context)",
  "claude-3-5-sonnet":
    "Our most intelligent model (Anthropic, 200k token context)",
  "claude-3-sonnet":
    "Our most intelligent model (Anthropic, 200k token context)",
  "claude-3-5-sonnet-4k":
    "Our most intelligent model (Anthropic, 4k token context)",
  "claude-3-5-haiku-8k":
    "Fastest model, lightweight actions (Anthropic, 8k token context)",
  "claude-4-sonnet-8k":
    "Best combination of performance and speed (Anthropic, 8k token context)",
  "claude-4-opus-8k":
    "Excels at writing and complex tasks (Anthropic, 8k token context)",
  "claude-4-5-sonnet-8k":
    "Most intelligent model with advanced reasoning (Anthropic, 8k token context)",
  "claude-4-5-opus-8k":
    "Flagship model excelling at complex tasks and writing (Anthropic, 8k token context)",
  "claude-4-5-haiku-8k":
    "Fastest and most cost-efficient model (Anthropic, 8k token context)",
  "claude-3-sonnet-4k":
    "Best combination of performance and speed (Anthropic, 4k token context)",
  "claude-3-opus":
    "Excels at writing and complex tasks (Anthropic, 200k token context)",
  "claude-3-opus-8k":
    "Excels at writing and complex tasks (Anthropic, 8k token context)",
  "o3-8k":
    "Advanced reasoning model with enhanced thinking capabilities (8k token context)",
  o3: "Advanced reasoning model with enhanced thinking capabilities (128k token context)",
  "o4-mini-8k":
    "Cost-efficient reasoning model with strong performance (8k token context)",
  "o4-mini":
    "Cost-efficient reasoning model with strong performance (128k token context)",
  "gpt-5-8k":
    "OpenAI's most advanced model with built-in reasoning (8k token context)",
  "gpt-5":
    "OpenAI's most advanced model with built-in reasoning (128k token context)",
  "gpt-5.2-8k":
    "OpenAI's most advanced model with built-in reasoning (8k token context)",
  "gpt-5.2":
    "OpenAI's most advanced model with built-in reasoning (128k token context)",
  "gpt-5-mini-8k":
    "Fast and cost-efficient version of GPT-5 (8k token context)",
  "gpt-5-mini": "Fast and cost-efficient version of GPT-5 (128k token context)",
  "gemini-3-flash-preview-16k":
    "Google's Gemini 3 Flash model (16k token context)",
  "grok-4-1-fast-non-reasoning-16k":
    "xAI's Grok 4.1 fast non-reasoning model (16k token context)",
  "grok-4-1-fast-reasoning-16k":
    "xAI's Grok 4.1 fast reasoning model (16k token context)",
  "grok-code-fast-1-16k":
    "xAI's Grok Code Fast model, specialized for coding tasks (16k token context)",
} as const;

export function isFreeModel(model: unknown, isCoCalcCom: boolean): boolean {
  if (!isCoCalcCom) return true;
  if (isUserDefinedModel(model)) return true;
  if (isOllamaLLM(model)) return true;
  if (isCustomOpenAI(model)) return true;
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
  service: string,
): service is LanguageService {
  if (isUserDefinedModel(service)) return true;
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
      return `No status information for Ollama available.`;
    case "custom_openai":
      return `No status information for Custom OpenAI available.`;
    case "mistralai":
      return `No status information for Mistral AI available.`;
    case "anthropic":
      return `Anthropic [status](https://status.anthropic.com/).`;
    case "xai":
      return `xAI [status](https://status.x.ai/).`;
    case "user":
      return `No status information for user defined model available.`;
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
export const LLM_COST: { [name in LanguageModelCore]: Cost } = {
  "gpt-4": {
    prompt_tokens: usd1Mtokens(30),
    completion_tokens: usd1Mtokens(60),
    max_tokens: 8192,
    free: false,
  },
  "gpt-4-32k": {
    prompt_tokens: usd1Mtokens(60),
    completion_tokens: usd1Mtokens(120),
    max_tokens: 32768,
    free: false,
  },
  "gpt-3.5-turbo": {
    prompt_tokens: usd1Mtokens(0.5),
    completion_tokens: usd1Mtokens(1.5),
    max_tokens: 4096,
    free: true,
  },
  "gpt-3.5-turbo-16k": {
    prompt_tokens: usd1Mtokens(3),
    completion_tokens: usd1Mtokens(4),
    max_tokens: 16384,
    free: false,
  },
  // like above, but we limit the tokens to reduce how much money user has to commit to
  "gpt-4-turbo-preview-8k": {
    prompt_tokens: usd1Mtokens(10),
    completion_tokens: usd1Mtokens(30),
    max_tokens: 8192, // the actual reply is 8k, and we use this to truncate the input prompt!
    free: false,
  },
  "gpt-4-turbo-preview": {
    prompt_tokens: usd1Mtokens(10), // 	$10.00 / 1M tokens
    completion_tokens: usd1Mtokens(30), // $30.00 / 1M tokens
    max_tokens: 128000, // This is a lot: blows up the "max cost" calculation → requires raising the minimum balance and quota limit
    free: false,
  }, // like above, but we limit the tokens to reduce how much money user has to commit to
  "gpt-4-turbo-8k": {
    prompt_tokens: usd1Mtokens(10),
    completion_tokens: usd1Mtokens(30),
    max_tokens: 8192, // the actual reply is 8k, and we use this to truncate the input prompt!
    free: false,
  },
  "gpt-4-turbo": {
    prompt_tokens: usd1Mtokens(10), // 	$10.00 / 1M tokens
    completion_tokens: usd1Mtokens(30), // $30.00 / 1M tokens
    max_tokens: 128000, // This is a lot: blows up the "max cost" calculation → requires raising the minimum balance and quota limit
    free: false,
  },
  "gpt-4.1": {
    prompt_tokens: usd1Mtokens(2),
    completion_tokens: usd1Mtokens(8),
    max_tokens: 8192,
    free: false,
  },
  "gpt-4.1-mini": {
    prompt_tokens: usd1Mtokens(0.4),
    completion_tokens: usd1Mtokens(1.6),
    max_tokens: 8192,
    free: true,
  },
  "gpt-4o-8k": {
    prompt_tokens: usd1Mtokens(2.5),
    completion_tokens: usd1Mtokens(10),
    max_tokens: 8192, // like gpt-4-turbo-8k
    free: false,
  },
  "gpt-4o": {
    prompt_tokens: usd1Mtokens(2.5),
    completion_tokens: usd1Mtokens(10),
    max_tokens: 128000, // This is a lot: blows up the "max cost" calculation → requires raising the minimum balance and quota limit
    free: false,
  },
  "gpt-4o-mini-8k": {
    prompt_tokens: usd1Mtokens(0.15),
    completion_tokens: usd1Mtokens(0.6),
    max_tokens: 8192, // like gpt-4-turbo-8k
    free: true,
  },
  "gpt-4o-mini": {
    prompt_tokens: usd1Mtokens(0.15),
    completion_tokens: usd1Mtokens(0.6),
    max_tokens: 128000, // This is a lot: blows up the "max cost" calculation → requires raising the minimum balance and quota limit
    free: true,
  },
  o1: {
    prompt_tokens: usd1Mtokens(15),
    completion_tokens: usd1Mtokens(60),
    max_tokens: 8192, // like gpt-4-turbo-8k
    free: false,
  },
  "o1-8k": {
    prompt_tokens: usd1Mtokens(15),
    completion_tokens: usd1Mtokens(60),
    max_tokens: 8192, // like gpt-4-turbo-8k
    free: false,
  },
  "o1-mini-8k": {
    prompt_tokens: usd1Mtokens(1.1),
    completion_tokens: usd1Mtokens(4.4),
    max_tokens: 8192, // like gpt-4-turbo-8k
    free: true,
  },
  "o1-mini": {
    prompt_tokens: usd1Mtokens(1.1),
    completion_tokens: usd1Mtokens(4.4),
    max_tokens: 8192, // like gpt-4-turbo-8k
    free: false,
  },
  // also OpenAI
  "text-embedding-ada-002": {
    prompt_tokens: usd1Mtokens(0.05),
    completion_tokens: usd1Mtokens(0.05), // NOTE: this isn't a thing with embeddings
    max_tokens: 8191,
    free: false,
  },
  // https://ai.google.dev/pricing
  "gemini-pro": {
    prompt_tokens: usd1Mtokens(0.5),
    completion_tokens: usd1Mtokens(1.5),
    max_tokens: 30720,
    free: true,
  },
  "gemini-1.5-pro-8k": {
    prompt_tokens: usd1Mtokens(1.25), // (we're below the 128k context)
    completion_tokens: usd1Mtokens(5),
    max_tokens: 8_000,
    free: false,
  },
  "gemini-1.5-pro": {
    prompt_tokens: usd1Mtokens(2.5),
    completion_tokens: usd1Mtokens(10),
    max_tokens: 1048576,
    free: false,
  },
  "gemini-1.0-ultra": {
    prompt_tokens: usd1Mtokens(1), // TODO: price not yet known!
    completion_tokens: usd1Mtokens(1),
    max_tokens: 30720,
    free: true,
  },
  "gemini-1.5-flash": {
    prompt_tokens: usd1Mtokens(0.075),
    completion_tokens: usd1Mtokens(0.3),
    max_tokens: 8_000,
    free: true,
  },
  "gemini-1.5-flash-8k": {
    prompt_tokens: usd1Mtokens(0.075),
    completion_tokens: usd1Mtokens(0.3),
    max_tokens: 8_000,
    free: true,
  },
  // https://ai.google.dev/gemini-api/docs/pricing?hl=de
  "gemini-2.0-flash-8k": {
    prompt_tokens: usd1Mtokens(0.1),
    completion_tokens: usd1Mtokens(0.4),
    max_tokens: 8_000,
    free: true,
  },
  "gemini-2.0-flash-lite-8k": {
    prompt_tokens: usd1Mtokens(0.075),
    completion_tokens: usd1Mtokens(0.3),
    max_tokens: 8_000,
    free: true,
  },
  "gemini-2.5-flash-8k": {
    prompt_tokens: usd1Mtokens(0.3),
    completion_tokens: usd1Mtokens(2.5),
    max_tokens: 8_000,
    free: true,
  },
  "gemini-2.5-pro-8k": {
    prompt_tokens: usd1Mtokens(1.25),
    completion_tokens: usd1Mtokens(10),
    max_tokens: 8_000,
    free: false,
  },
  "gemini-3-flash-preview-16k": {
    prompt_tokens: usd1Mtokens(0.5),
    completion_tokens: usd1Mtokens(3.0),
    max_tokens: 16_000,
    free: true,
  },
  "gemini-3-pro-preview-8k": {
    prompt_tokens: usd1Mtokens(2),
    completion_tokens: usd1Mtokens(4),
    max_tokens: 8_000,
    free: false,
  },
  // https://mistral.ai/technology/
  "mistral-small-latest": {
    prompt_tokens: usd1Mtokens(0.2),
    completion_tokens: usd1Mtokens(0.6),
    max_tokens: 4096, // TODO don't know the real value, see getMaxTokens
    free: true,
  },
  "mistral-medium-latest": {
    prompt_tokens: usd1Mtokens(0.4),
    completion_tokens: usd1Mtokens(2),
    max_tokens: 4096, // TODO don't know the real value, see getMaxTokens
    free: true,
  },
  "mistral-large-latest": {
    prompt_tokens: usd1Mtokens(2),
    completion_tokens: usd1Mtokens(6),
    max_tokens: 4096, // TODO don't know the real value, see getMaxTokens
    free: false,
  },
  "devstral-medium-2507": {
    prompt_tokens: usd1Mtokens(0.4),
    completion_tokens: usd1Mtokens(2),
    max_tokens: 8_000, // TODO don't know the real value, see getMaxTokens
    free: true,
  },
  // "magistral-medium-latest": {
  //   prompt_tokens: usd1Mtokens(2),
  //   completion_tokens: usd1Mtokens(5),
  //   max_tokens: 8_000, // TODO don't know the real value, see getMaxTokens
  //   free: false,
  // },
  // Anthropic: pricing somewhere on that page: https://www.anthropic.com/api
  "claude-3-opus-8k": {
    prompt_tokens: usd1Mtokens(15),
    completion_tokens: usd1Mtokens(75),
    max_tokens: 8_000, // limited to 8k tokens, to reduce the necessary spend limit to commit to
    free: false,
  },
  "claude-3-opus": {
    prompt_tokens: usd1Mtokens(15),
    completion_tokens: usd1Mtokens(75),
    max_tokens: 200_000,
    free: false,
  },
  "claude-3-5-sonnet": {
    prompt_tokens: usd1Mtokens(3),
    completion_tokens: usd1Mtokens(15),
    max_tokens: 200_000,
    free: false,
  },
  "claude-3-5-sonnet-4k": {
    prompt_tokens: usd1Mtokens(3),
    completion_tokens: usd1Mtokens(15),
    max_tokens: 4_000, // limited to 4k tokens
    free: false,
  },
  "claude-3-sonnet-4k": {
    prompt_tokens: usd1Mtokens(3),
    completion_tokens: usd1Mtokens(15),
    max_tokens: 4_000, // limited to 4k tokens, offered for free
    free: false,
  },
  "claude-3-sonnet": {
    prompt_tokens: usd1Mtokens(3),
    completion_tokens: usd1Mtokens(15),
    max_tokens: 200_000,
    free: false,
  },
  "claude-3-haiku-8k": {
    prompt_tokens: usd1Mtokens(0.8),
    completion_tokens: usd1Mtokens(4),
    max_tokens: 8_000, // limited to 8k tokens, offered for free
    free: true,
  },
  "claude-3-haiku": {
    prompt_tokens: usd1Mtokens(0.8),
    completion_tokens: usd1Mtokens(4),
    max_tokens: 8_000, // limited to 8k tokens, offered for free
    free: true,
  },
  "claude-3-5-haiku-8k": {
    prompt_tokens: usd1Mtokens(0.8),
    completion_tokens: usd1Mtokens(4),
    max_tokens: 8_000,
    free: true,
  },
  "claude-4-sonnet-8k": {
    prompt_tokens: usd1Mtokens(3),
    completion_tokens: usd1Mtokens(15),
    max_tokens: 8_000,
    free: false,
  },
  "claude-4-opus-8k": {
    prompt_tokens: usd1Mtokens(15),
    completion_tokens: usd1Mtokens(75),
    max_tokens: 8_000,
    free: false,
  },
  "claude-4-5-sonnet-8k": {
    prompt_tokens: usd1Mtokens(3),
    completion_tokens: usd1Mtokens(15),
    max_tokens: 8_000,
    free: false,
  },
  "claude-4-5-opus-8k": {
    prompt_tokens: usd1Mtokens(5),
    completion_tokens: usd1Mtokens(25),
    max_tokens: 8_000,
    free: false,
  },
  "claude-4-5-haiku-8k": {
    prompt_tokens: usd1Mtokens(1),
    completion_tokens: usd1Mtokens(5),
    max_tokens: 8_000,
    free: true,
  },
  "o3-8k": {
    prompt_tokens: usd1Mtokens(2),
    completion_tokens: usd1Mtokens(8),
    max_tokens: 8192,
    free: false,
  },
  o3: {
    prompt_tokens: usd1Mtokens(2),
    completion_tokens: usd1Mtokens(8),
    max_tokens: 128000,
    free: false,
  },
  "o4-mini-8k": {
    prompt_tokens: usd1Mtokens(1.1),
    completion_tokens: usd1Mtokens(4.4),
    max_tokens: 8192,
    free: false,
  },
  "o4-mini": {
    prompt_tokens: usd1Mtokens(1.1),
    completion_tokens: usd1Mtokens(4.4),
    max_tokens: 128000,
    free: false,
  },
  "gpt-5-8k": {
    prompt_tokens: usd1Mtokens(1.25),
    completion_tokens: usd1Mtokens(10),
    max_tokens: 8192,
    free: false,
  },
  "gpt-5": {
    prompt_tokens: usd1Mtokens(1.25),
    completion_tokens: usd1Mtokens(10),
    max_tokens: 128000,
    free: false,
  },
  "gpt-5.2-8k": {
    prompt_tokens: usd1Mtokens(1.25),
    completion_tokens: usd1Mtokens(10),
    max_tokens: 8192,
    free: false,
  },
  "gpt-5.2": {
    prompt_tokens: usd1Mtokens(1.25),
    completion_tokens: usd1Mtokens(10),
    max_tokens: 128000,
    free: false,
  },
  "gpt-5-mini-8k": {
    prompt_tokens: usd1Mtokens(0.25),
    completion_tokens: usd1Mtokens(2),
    max_tokens: 8192,
    free: true,
  },
  "gpt-5-mini": {
    prompt_tokens: usd1Mtokens(0.25),
    completion_tokens: usd1Mtokens(2),
    max_tokens: 128000,
    free: true,
  },
  // xAI (https://x.ai/)
  "grok-4-1-fast-non-reasoning-16k": {
    prompt_tokens: usd1Mtokens(0.2),
    completion_tokens: usd1Mtokens(0.5),
    max_tokens: 16_000,
    free: true,
  },
  "grok-4-1-fast-reasoning-16k": {
    prompt_tokens: usd1Mtokens(0.2),
    completion_tokens: usd1Mtokens(0.5),
    max_tokens: 16_000,
    free: true,
  },
  "grok-code-fast-1-16k": {
    prompt_tokens: usd1Mtokens(0.2),
    completion_tokens: usd1Mtokens(1.5),
    max_tokens: 16_000,
    free: true,
  },
} as const;

// TODO: remove this test – it's only used server side, and that server side check should work for all known LLM models
export function isValidModel(model?: string): boolean {
  if (model == null) return false;
  if (isUserDefinedModel(model)) return true;
  if (isOllamaLLM(model)) return true;
  if (isCustomOpenAI(model)) return true;
  if (isMistralModel(model)) return true;
  if (isGoogleModel(model)) return true;
  return LLM_COST[model ?? ""] != null;
}

export function getMaxTokens(model?: LanguageModel): number {
  // TODO: store max tokens in the model object itself, this is just a fallback
  if (isOllamaLLM(model)) return 8192;
  return LLM_COST[model ?? ""]?.max_tokens ?? 4096;
}

export interface LLMCost {
  prompt_tokens: number;
  completion_tokens: number;
}

export function getLLMCost(
  model: LanguageModelCore,
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

const priceRangeCache = new LRU<string, ReturnType<typeof getLLMPriceRange>>({
  max: 10,
});

export function getLLMPriceRange(
  prompt: number,
  output: number,
  markup_percentage: number,
): { min: number; max: number } {
  const cacheKey = `${prompt}::${output}::${markup_percentage}`;
  const cached = priceRangeCache.get(cacheKey);
  if (cached) return cached;

  let min = Infinity;
  let max = 0;
  for (const key in LLM_COST) {
    const model = LLM_COST[key];
    if (!model || isFreeModel(key, true)) continue;
    const { prompt_tokens, completion_tokens } = getLLMCost(
      key as LanguageModelCore,
      markup_percentage,
    );
    const p = prompt * prompt_tokens + output * completion_tokens;

    min = Math.min(min, p);
    max = Math.max(max, p);
  }
  const ret = { min, max };
  priceRangeCache.set(cacheKey, ret);
  return ret;
}

// The maximum cost for one single call using the given model.
// We can't know the cost until after it happens, so this bound is useful for
// ensuring user can afford to make a call.
export function getMaxCost(
  model: LanguageModelCore,
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

  if (
    model2vendor(model).name === "openai" ||
    model.startsWith(OPENAI_PREFIX)
  ) {
    const mdCode =
      "Include the language directly after the triple backticks in all markdown code blocks.";
    return `Assume full access to CoCalc and using CoCalc right now.\n${mdCode}\n${math}\n${common}`;
  }

  // mistral stupidly inserts anything mentioned in the prompt as examples, always.
  if (
    model2vendor(model).name === "mistralai" ||
    model.startsWith(MISTRAL_PREFIX)
  ) {
    return common;
  }

  if (
    model2vendor(model).name === "google" ||
    model.startsWith(GOOGLE_PREFIX)
  ) {
    return `${math}\n${common}`;
  }

  if (
    model2vendor(model).name === "ollama" ||
    model.startsWith(OLLAMA_PREFIX)
  ) {
    return `${common}`;
  }

  if (
    model2vendor(model).name === "anthropic" ||
    model.startsWith(ANTHROPIC_PREFIX)
  ) {
    return `${math}\n${common}`;
  }

  if (model2vendor(model).name === "xai" || model.startsWith(XAI_PREFIX)) {
    return `${math}\n${common}`;
  }

  const mdCode = `Any code blocks in triple backticks should mention the language after the first backticks. For example \`\`\`python\nprint("Hello, World!")\n\`\`\``;
  return `${mdCode}\n${math}\n${common}`;
}
