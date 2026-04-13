/**
 * Copyright (C) 2023-2026, Sagemath Inc.
 *
 * Unified AI SDK evaluation implementation.
 *
 * Uses the Vercel AI SDK (https://sdk.vercel.ai) for all LLM providers.
 * Supports Anthropic prompt caching for reduced latency and cost.
 */

import type { ModelMessage } from "ai";
import { generateText, streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings";
import type { ServerSettings } from "@cocalc/database/settings/server-settings";
import {
  ANTHROPIC_VERSION,
  AnthropicModel,
  fromCustomOpenAIModel,
  fromOllamaModel,
  GOOGLE_MODEL_TO_ID,
  GoogleModel,
  isAnthropicModel,
  isCustomOpenAI,
  isGoogleModel,
  isMistralModel,
  isOllamaLLM,
  isOpenAIModel,
  isXaiModel,
  isZaiModel,
  toXaiProviderModel,
  toZaiProviderModel,
  UserDefinedLLMService,
} from "@cocalc/util/db-schema/llm-utils";
import { unreachable } from "@cocalc/util/misc";
import type { ChatOutput, History, Stream } from "@cocalc/util/types/llm";
import { transformHistoryToMessages } from "./chat-history";
import {
  getCustomOpenAIModel,
  getOllamaModel,
  type ModelWithOverrides,
} from "./client";
import { normalizeOpenAIModel } from "./index";
import { buildChatOutput } from "./utils";

const log = getLogger("llm:evaluate-ai");

// Common interface for all LLM evaluation options
export interface LLMEvaluationOptions {
  input: string;
  system?: string;
  history?: History;
  model: string;
  stream?: Stream;
  maxTokens?: number;
  apiKey?: string;
  endpoint?: string;
  service?: UserDefinedLLMService;
}

// Provider-specific configuration
export interface LLMProviderConfig {
  name: string;

  // Create a Vercel AI SDK LanguageModelV1 instance, optionally with
  // request-level overrides (temperature, topK, …) from admin config.
  createModel: (
    options: LLMEvaluationOptions,
    settings: ServerSettings,
    mode: "cocalc" | "user",
  ) => Promise<ModelWithOverrides>;

  // Mode === "cocalc" only: validate provider availability
  checkEnabled?: (settings: ServerSettings) => string | void;

  // Model name normalization for platform-defined internal namings
  canonicalModel?: (model: string) => string;

  // Whether this provider supports prompt caching (Anthropic)
  supportsCaching?: boolean;
}

// Reusable cache control marker for Anthropic prompt caching.
// Marks a message as a cache breakpoint so Anthropic caches the KV state
// of all tokens up to and including this message. Cached input tokens cost
// 90% less and TTFT drops significantly for repeated prefixes.
const ANTHROPIC_CACHE_CONTROL = {
  providerOptions: {
    anthropic: { cacheControl: { type: "ephemeral" as const } },
  },
};

// Provider configurations
export const PROVIDER_CONFIGS = {
  openai: {
    name: "OpenAI",
    checkEnabled: (settings) => {
      if (!settings.openai_enabled) throw new Error("OpenAI is not enabled.");
      if (!settings.openai_api_key)
        throw new Error("OpenAI API key is not configured.");
      return settings.openai_api_key;
    },
    createModel: async (options, settings, mode) => {
      const apiKey =
        mode === "cocalc" ? settings.openai_api_key : options.apiKey;
      if (!apiKey) throw new Error("OpenAI API key is not configured.");
      const modelName =
        mode === "user" ? options.model : normalizeOpenAIModel(options.model);
      log.debug(
        `OpenAI createModel: original=${options.model}, normalized=${modelName}`,
      );
      return {
        model: createOpenAI({
          apiKey,
          ...(options.endpoint ? { baseURL: options.endpoint } : {}),
        }).chat(modelName),
      };
    },
    canonicalModel: (model) => normalizeOpenAIModel(model),
  },

  google: {
    name: "Google GenAI",
    checkEnabled: (settings) => {
      if (!settings.google_vertexai_enabled)
        throw new Error("Google GenAI is not enabled.");
      if (!settings.google_vertexai_key)
        throw new Error("Google GenAI API key is not configured.");
      return settings.google_vertexai_key;
    },
    createModel: async (options, settings, mode) => {
      const apiKey =
        mode === "cocalc" ? settings.google_vertexai_key : options.apiKey;
      if (!apiKey) throw new Error("Google GenAI API key is not configured.");
      const modelName =
        mode === "cocalc"
          ? (GOOGLE_MODEL_TO_ID[options.model as GoogleModel] ?? options.model)
          : options.model;
      log.debug(
        `Google createModel: original=${options.model}, modelName=${modelName}`,
      );
      return { model: createGoogleGenerativeAI({ apiKey })(modelName) };
    },
    canonicalModel: (model) =>
      GOOGLE_MODEL_TO_ID[model as GoogleModel] ?? model,
  },

  anthropic: {
    name: "Anthropic",
    supportsCaching: true,
    checkEnabled: (settings) => {
      if (!settings.anthropic_enabled)
        throw new Error("Anthropic is not enabled.");
      if (!settings.anthropic_api_key)
        throw new Error("Anthropic API key is not configured.");
      return settings.anthropic_api_key;
    },
    createModel: async (options, settings, mode) => {
      const apiKey =
        mode === "cocalc" ? settings.anthropic_api_key : options.apiKey;
      if (!apiKey) throw new Error("Anthropic API key is not configured.");
      const modelName =
        mode === "cocalc"
          ? ANTHROPIC_VERSION[options.model as AnthropicModel]
          : options.model;
      if (modelName == null) {
        throw new Error(
          `Anthropic model ${options.model} is no longer supported`,
        );
      }
      log.debug(
        `Anthropic createModel: original=${options.model}, modelVersion=${modelName}`,
      );
      return { model: createAnthropic({ apiKey })(modelName) };
    },
    canonicalModel: (model) => {
      const version = ANTHROPIC_VERSION[model as AnthropicModel];
      if (version == null)
        throw new Error(`Anthropic model ${model} is no longer supported`);
      return version;
    },
  },

  mistral: {
    name: "Mistral",
    checkEnabled: (settings) => {
      if (!settings.mistral_enabled) throw new Error("Mistral is not enabled.");
      if (!settings.mistral_api_key)
        throw new Error("Mistral API key is not configured.");
      return settings.mistral_api_key;
    },
    createModel: async (options, settings, mode) => {
      const apiKey =
        mode === "cocalc" ? settings.mistral_api_key : options.apiKey;
      if (!apiKey) throw new Error("Mistral API key is not configured.");
      log.debug(`Mistral createModel: model=${options.model}`);
      return { model: createMistral({ apiKey })(options.model) };
    },
  },

  xai: {
    name: "xAI",
    checkEnabled: (settings) => {
      if (!settings.xai_enabled) throw new Error("xAI is not enabled.");
      if (!settings.xai_api_key)
        throw new Error("xAI API key is not configured.");
      return settings.xai_api_key;
    },
    createModel: async (options, settings, mode) => {
      const apiKey = mode === "cocalc" ? settings.xai_api_key : options.apiKey;
      if (!apiKey) throw new Error("xAI API key is not configured.");
      const modelName =
        mode === "cocalc" ? toXaiProviderModel(options.model) : options.model;
      log.debug(
        `xAI createModel: original=${options.model}, modelName=${modelName}`,
      );
      return { model: createXai({ apiKey })(modelName) };
    },
    canonicalModel: (model) => toXaiProviderModel(model),
  },

  "custom-openai": {
    name: "Custom OpenAI",
    checkEnabled: (settings) => {
      if (!settings.custom_openai_enabled)
        throw new Error("Custom OpenAI is not enabled.");
    },
    createModel: async (options, _settings, mode) => {
      switch (mode) {
        case "user":
          log.debug("Custom OpenAI createModel (user)", {
            model: options.model,
            endpoint: options.endpoint,
          });
          return {
            model: createOpenAI({
              apiKey: options.apiKey ?? "",
              ...(options.endpoint ? { baseURL: options.endpoint } : {}),
            }).chat(options.model),
          };
        case "cocalc": {
          const transformedModel = fromCustomOpenAIModel(options.model);
          log.debug(
            `Custom OpenAI createModel: original=${options.model}, transformed=${transformedModel}`,
          );
          return await getCustomOpenAIModel(transformedModel);
        }
        default:
          unreachable(mode);
          throw new Error(`Invalid LLM mode: ${mode}`);
      }
    },
    canonicalModel: (model) => fromCustomOpenAIModel(model),
  },

  ollama: {
    name: "Ollama",
    createModel: async (options, _settings, _mode) => {
      if (options.endpoint) {
        // User-defined Ollama with custom endpoint
        const modelName = fromOllamaModel(options.model);
        log.debug("Ollama createModel (user endpoint)", {
          model: modelName,
          endpoint: options.endpoint,
        });
        return {
          model: createOpenAI({
            apiKey: "ollama",
            baseURL: `${options.endpoint.replace(/\/+$/, "")}/v1`,
          }).chat(modelName),
        };
      }
      // Platform Ollama from server settings
      const modelName = fromOllamaModel(options.model);
      log.debug(`Ollama createModel: model=${modelName}`);
      return await getOllamaModel(modelName);
    },
  },

  zai: {
    name: "Zhipu AI",
    checkEnabled: (settings) => {
      if (!settings.zai_enabled) throw new Error("Zhipu AI is not enabled.");
      if (!settings.zai_api_key)
        throw new Error("Zhipu AI API key is not configured.");
      return settings.zai_api_key;
    },
    createModel: async (options, settings, mode) => {
      const apiKey = mode === "cocalc" ? settings.zai_api_key : options.apiKey;
      if (!apiKey) throw new Error("Zhipu AI API key is not configured.");
      const modelName =
        mode === "cocalc" ? toZaiProviderModel(options.model) : options.model;
      log.debug(
        `ZAI createModel: original=${options.model}, modelName=${modelName}`,
      );
      return {
        model: createOpenAI({
          apiKey,
          baseURL: "https://open.bigmodel.cn/api/paas/v4",
          ...(options.endpoint ? { baseURL: options.endpoint } : {}),
        }).chat(modelName),
      };
    },
    canonicalModel: (model) => toZaiProviderModel(model),
  },
} satisfies Record<string, LLMProviderConfig>;

// Get provider config based on model or explicit service type
export function getProviderConfig(
  model: string,
  service?: UserDefinedLLMService,
): LLMProviderConfig {
  if (service) {
    switch (service) {
      case "openai":
        return PROVIDER_CONFIGS.openai;
      case "google":
        return PROVIDER_CONFIGS.google;
      case "anthropic":
        return PROVIDER_CONFIGS.anthropic;
      case "mistralai":
        return PROVIDER_CONFIGS.mistral;
      case "xai":
        return PROVIDER_CONFIGS.xai;
      case "zai":
        return PROVIDER_CONFIGS.zai;
      case "custom_openai":
        return PROVIDER_CONFIGS["custom-openai"];
      case "ollama":
        return PROVIDER_CONFIGS.ollama;
      default:
        throw new Error(`Unknown service for provider config: ${service}`);
    }
  }

  if (isOpenAIModel(model)) return PROVIDER_CONFIGS.openai;
  if (isGoogleModel(model)) return PROVIDER_CONFIGS.google;
  if (isAnthropicModel(model)) return PROVIDER_CONFIGS.anthropic;
  if (isMistralModel(model)) return PROVIDER_CONFIGS.mistral;
  if (isXaiModel(model)) return PROVIDER_CONFIGS.xai;
  if (isZaiModel(model)) return PROVIDER_CONFIGS.zai;
  if (isCustomOpenAI(model)) return PROVIDER_CONFIGS["custom-openai"];
  if (isOllamaLLM(model)) return PROVIDER_CONFIGS.ollama;

  throw new Error(`Unknown model provider for: ${model}`);
}

/**
 * Main unified evaluation function using the Vercel AI SDK.
 *
 * All LLM providers (OpenAI, Anthropic, Google, Mistral, xAI, Custom OpenAI,
 * Ollama) go through this single code path. Messages are built as a simple
 * array of CoreMessage objects – no prompt templates or chain abstractions.
 *
 * For Anthropic models, cache_control breakpoints are automatically added
 * to the system message and the last history message so repeated conversation
 * prefixes are served from Anthropic's KV cache (90% cheaper input tokens,
 * much lower TTFT).
 */
export async function evaluateWithAI(
  options: LLMEvaluationOptions,
  mode: "cocalc" | "user" = "cocalc",
): Promise<ChatOutput> {
  const {
    input,
    system,
    history = [],
    model,
    stream,
    maxTokens,
    service,
  } = options;

  log.debug("evaluateWithAI", {
    input,
    history,
    system,
    model,
    stream: stream != null,
    maxTokens,
  });

  const config = getProviderConfig(model, service);
  const settings = await getServerSettings();
  if (mode === "cocalc") {
    config.checkEnabled?.(settings);
  }

  // Create the AI SDK model instance (may include request-level overrides
  // from admin config, e.g. temperature/topK for Ollama or Custom OpenAI)
  const { model: aiModel, requestOverrides } = await config.createModel(
    options,
    settings,
    mode,
  );

  // Convert history to messages and count tokens for fallback
  const { messages: historyMessages, tokens: historyTokens } =
    transformHistoryToMessages(history);

  // Build the full message array: [system] + history + new user input
  const messages: ModelMessage[] = [];

  if (system) {
    messages.push({
      role: "system",
      content: system,
      // Anthropic: cache the system prompt so it doesn't get re-processed
      ...(config.supportsCaching ? ANTHROPIC_CACHE_CONTROL : {}),
    });
  }

  for (let i = 0; i < historyMessages.length; i++) {
    const msg = historyMessages[i];
    const isLast = i === historyMessages.length - 1;
    messages.push({
      ...msg,
      // Anthropic: second cache breakpoint at end of history
      ...(config.supportsCaching && isLast ? ANTHROPIC_CACHE_CONTROL : {}),
    });
  }

  messages.push({ role: "user", content: input });

  // Admin config overrides first, then explicit user/caller settings on top
  const requestOptions = {
    model: aiModel,
    messages,
    ...requestOverrides,
    ...(maxTokens != null ? { maxOutputTokens: maxTokens } : {}),
  };

  if (stream) {
    const result = streamText(requestOptions);

    let output = "";
    for await (const text of result.textStream) {
      output += text;
      stream(text);
    }
    stream(null);

    const usage = await result.usage;
    const providerMetadata = await result.providerMetadata;
    return buildChatOutput(
      output,
      usage,
      input,
      historyTokens,
      config.name,
      providerMetadata,
    );
  } else {
    const result = await generateText(requestOptions);
    return buildChatOutput(
      result.text,
      result.usage,
      input,
      historyTokens,
      config.name,
      result.providerMetadata,
    );
  }
}

// For backward compatibility – the old name is still used in some tests and imports
export const evaluateWithLangChain = evaluateWithAI;

