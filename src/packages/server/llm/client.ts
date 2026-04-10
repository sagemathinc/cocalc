/*
 * Copyright (C) 2023-2026, Sagemath Inc.
 *
 * Get AI SDK model instances for Ollama and Custom OpenAI providers.
 * These read configuration from server settings and return LanguageModelV1 instances.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { omit } from "lodash";

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { isCustomOpenAI, isOllamaLLM } from "@cocalc/util/db-schema/llm-utils";

const log = getLogger("llm:client");

/**
 * Result from getOllamaModel / getCustomOpenAIModel.
 * Besides the AI SDK model instance, we also return request-level overrides
 * (temperature, topK, …) that the admin configured for this model.
 * The caller (evaluateWithAI) merges these into the generateText/streamText call.
 */
export interface ModelWithOverrides {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  requestOverrides?: Record<string, unknown>;
}

/** Keys that map to generateText / streamText request-level options. */
const REQUEST_LEVEL_KEYS = new Set([
  "temperature",
  "topP",
  "topK",
  "frequencyPenalty",
  "presencePenalty",
  "seed",
  "maxRetries",
  "stopSequences",
]);

/**
 * Split an admin config object into provider-level options (headers, etc.)
 * and request-level overrides (temperature, topK, …).
 */
function splitConfigExtras(
  config: Record<string, unknown>,
  skipKeys: string[],
): {
  providerOptions: Record<string, unknown>;
  requestOverrides: Record<string, unknown>;
} {
  const skip = new Set(skipKeys);
  const providerOptions: Record<string, unknown> = {};
  const requestOverrides: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (skip.has(key) || value == null) continue;
    if (REQUEST_LEVEL_KEYS.has(key)) {
      requestOverrides[key] = value;
    } else if (key === "headers") {
      providerOptions.headers = value;
    } else {
      // Unrecognised keys are collected so callers can log them.
      if (!providerOptions._unknownKeys) {
        providerOptions._unknownKeys = {} as Record<string, unknown>;
      }
      (providerOptions._unknownKeys as Record<string, unknown>)[key] = value;
    }
  }

  return { providerOptions, requestOverrides };
}

/**
 * Create a Vercel AI SDK model for an Ollama model configured in server settings.
 * Uses Ollama's OpenAI-compatible API endpoint (/v1).
 *
 * The "model" parameter should be the raw model name WITHOUT the "ollama-" prefix
 * (i.e., already processed by fromOllamaModel).
 */
export async function getOllamaModel(
  model: string,
): Promise<ModelWithOverrides> {
  if (isOllamaLLM(model)) {
    throw new Error(
      `At this point, the model name should be one of Ollama, but it was ${model}`,
    );
  }

  const settings = await getServerSettings();
  const config = settings.ollama_configuration?.[model];
  if (!config) {
    throw new Error(
      `Ollama model ${model} not configured – you have to create an entry {${model}: {baseUrl: "https://...", ...}} in the "Ollama Configuration" entry of the server settings!`,
    );
  }

  if (config.cocalc?.disabled) {
    throw new Error(`Ollama model ${model} is disabled`);
  }

  const baseUrl = config.baseUrl;
  if (!baseUrl) {
    throw new Error(
      `The "baseUrl" field of the Ollama model ${model} is not configured`,
    );
  }

  const modelName = config.model ?? model;

  // Split remaining config into provider-level and request-level options.
  // Ollama-native keys like "keepAlive" are not in the skip list so they
  // end up in _unknownKeys and are reported in the warning below.
  const { providerOptions, requestOverrides } = splitConfigExtras(config, [
    "baseUrl",
    "model",
    "cocalc",
  ]);

  // Warn about Ollama-native keys that can't be forwarded via OpenAI-compat API
  const unknownKeys = providerOptions._unknownKeys as
    | Record<string, unknown>
    | undefined;
  delete providerOptions._unknownKeys;
  if (unknownKeys && Object.keys(unknownKeys).length > 0) {
    log.warn(
      `Ollama model "${model}": the following config keys are not supported via the OpenAI-compatible endpoint and will be ignored: ${Object.keys(unknownKeys).join(", ")}. ` +
        `Only standard request options (${[...REQUEST_LEVEL_KEYS].join(", ")}) and "headers" are forwarded.`,
    );
  }

  log.debug("Creating Ollama model via OpenAI-compatible endpoint", {
    baseUrl,
    modelName,
    requestOverrides,
  });

  const provider = createOpenAI({
    apiKey: "ollama", // Ollama doesn't require a real API key
    baseURL: `${baseUrl.replace(/\/+$/, "")}/v1`,
    compatibility: "compatible",
    ...providerOptions,
  });

  return {
    model: provider(modelName),
    ...(Object.keys(requestOverrides).length > 0 ? { requestOverrides } : {}),
  };
}

/**
 * Create a Vercel AI SDK model for a Custom OpenAI endpoint configured in server settings.
 *
 * The "model" parameter should be the raw model name WITHOUT the "custom_openai-" prefix
 * (i.e., already processed by fromCustomOpenAIModel).
 */
export async function getCustomOpenAIModel(
  model: string,
): Promise<ModelWithOverrides> {
  if (isCustomOpenAI(model)) {
    throw new Error(
      `At this point, the model name should be one of the custom openai models, but it was ${model}`,
    );
  }

  const { custom_openai_configuration } = await getServerSettings();
  const config = custom_openai_configuration?.[model];
  if (!config) {
    throw new Error(
      `Custom OpenAI model ${model} not configured – you have to create an entry {${model}: {baseUrl: "https://...", ...}} in the "Custom OpenAI Configuration" entry of the server settings!`,
    );
  }

  if (config.cocalc?.disabled) {
    throw new Error(`Custom OpenAI model ${model} is disabled`);
  }

  const baseURL = config.baseUrl;
  if (!baseURL) {
    throw new Error(
      `The "baseUrl" field of the Custom OpenAI model ${model} is not configured`,
    );
  }

  // Handle legacy API key field names for backward compatibility
  const apiKey =
    config.apiKey || config.openAIApiKey || config.azureOpenAIApiKey || "";
  const modelName = config.model ?? model;

  // Split remaining config into provider-level and request-level options.
  const { providerOptions, requestOverrides } = splitConfigExtras(config, [
    "baseUrl",
    "model",
    "cocalc",
    "apiKey",
    "openAIApiKey",
    "azureOpenAIApiKey",
  ]);

  // Clean up internal _unknownKeys (custom OpenAI endpoints may accept unknown
  // keys through their own extension points, but we don't forward them here).
  delete providerOptions._unknownKeys;

  log.debug(
    "Creating Custom OpenAI model",
    omit({ baseURL, modelName, ...config }, [
      "apiKey",
      "openAIApiKey",
      "azureOpenAIApiKey",
    ]),
  );

  const provider = createOpenAI({
    apiKey,
    baseURL,
    compatibility: "compatible",
    ...providerOptions,
  });

  return {
    model: provider(modelName),
    ...(Object.keys(requestOverrides).length > 0 ? { requestOverrides } : {}),
  };
}
