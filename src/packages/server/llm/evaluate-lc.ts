/**
 * Unified LangChain evaluation implementation
 *
 * This file provides a unified interface for all LangChain-based LLM providers,
 * eliminating code duplication while preserving all provider-specific functionality.
 */

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings";
import { ServerSettings } from "@cocalc/database/settings/server-settings";
import {
  ANTHROPIC_VERSION,
  AnthropicModel,
  fromCustomOpenAIModel,
  GOOGLE_MODEL_TO_ID,
  GoogleModel,
  isAnthropicModel,
  isCustomOpenAI,
  isGoogleModel,
  isMistralModel,
  isOpenAIModel,
} from "@cocalc/util/db-schema/llm-utils";
import type { ChatOutput, History, Stream } from "@cocalc/util/types/llm";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessageChunk } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { concat } from "@langchain/core/utils/stream";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatOpenAI } from "@langchain/openai";
import { transformHistoryToMessages } from "./chat-history";
import { numTokens } from "./chatgpt-numtokens";
import { getCustomOpenAI } from "./client";
import { normalizeOpenAIModel } from "./normalize-openai";

const log = getLogger("llm:evaluate-lc");

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
}

// Provider-specific client configuration
export interface LLMProviderConfig {
  // Provider identification
  name: string;

  // Client creation function
  createClient: (
    options: LLMEvaluationOptions,
    settings: ServerSettings,
    mode: "cocalc" | "user",
  ) => Promise<any>;

  // Model processing
  canonicalModel?: (model: string) => string;

  // Special handling flags
  getSystemRole?: (model: string) => string;

  // Token counting fallback
  getTokenCountFallback?: (
    input: string,
    output: string,
    historyTokens: number,
    model: string,
    settings: any,
  ) => Promise<{ prompt_tokens: number; completion_tokens: number }>;
}

function isO1Model(normalizedModel) {
  return normalizedModel === "o1" || normalizedModel === "o1-mini";
}

// Provider configurations
export const PROVIDER_CONFIGS = {
  openai: {
    name: "OpenAI",
    createClient: async (options, settings) => {
      const { openai_api_key: apiKey } = settings;
      const normalizedModel = normalizeOpenAIModel(options.model);

      log.debug(
        `OpenAI createClient: original=${options.model}, normalized=${normalizedModel}`,
      );

      // Check if it's O1 model (doesn't support streaming)
      const isO1 = isO1Model(normalizedModel);
      return new ChatOpenAI({
        model: normalizedModel,
        apiKey: options.apiKey || apiKey,
        maxTokens: options.maxTokens,
        streaming: options.stream != null && !isO1,
        streamUsage: true,
        ...(options.stream != null && !isO1
          ? { streamOptions: { includeUsage: true } }
          : {}),
      });
    },
    canonicalModel: (model) => normalizeOpenAIModel(model),
    getSystemRole: (_model) => "system",
    getTokenCountFallback: async (input, output, historyTokens) => ({
      prompt_tokens: numTokens(input) + historyTokens,
      completion_tokens: numTokens(output),
    }),
  },

  google: {
    name: "Google GenAI",
    createClient: async (options, settings, mode) => {
      const apiKey =
        mode === "cocalc" ? settings.google_vertexai_key : options.apiKey;
      const modelName =
        mode === "cocalc"
          ? GOOGLE_MODEL_TO_ID[options.model as GoogleModel] ?? options.model
          : options.model;

      log.debug(
        `Google createClient: original=${options.model}, modelName=${modelName}`,
      );

      return new ChatGoogleGenerativeAI({
        model: modelName,
        apiKey: options.apiKey || apiKey,
        maxOutputTokens: options.maxTokens,
        // Only enable thinking tokens for Gemini 2.5 models
        ...(modelName === "gemini-2.5-flash" || modelName === "gemini-2.5-pro"
          ? { maxReasoningTokens: 1024 }
          : {}),
        streaming: true,
      });
    },
    canonicalModel: (model) =>
      GOOGLE_MODEL_TO_ID[model as GoogleModel] ?? model,
    getTokenCountFallback: async (input, output, historyTokens) => ({
      prompt_tokens: numTokens(input) + historyTokens,
      completion_tokens: numTokens(output),
    }),
  },

  anthropic: {
    name: "Anthropic",
    createClient: async (options, settings, mode) => {
      const apiKey =
        mode === "cocalc" ? settings.anthropic_api_key : options.apiKey;
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
        `Anthropic createClient: original=${options.model}, modelVersion=${modelName}`,
      );

      return new ChatAnthropic({
        model: modelName,
        apiKey,
        maxTokens: options.maxTokens,
      });
    },
    canonicalModel: (model) => {
      const version = ANTHROPIC_VERSION[model as AnthropicModel];
      if (version == null) {
        throw new Error(`Anthropic model ${model} is no longer supported`);
      }
      return version;
    },
    getTokenCountFallback: async (input, output, historyTokens) => ({
      prompt_tokens: numTokens(input) + historyTokens,
      completion_tokens: numTokens(output),
    }),
  },

  mistral: {
    name: "Mistral",
    createClient: async (options, settings, mode) => {
      const apiKey =
        mode === "cocalc" ? settings.mistral_api_key : options.apiKey;

      log.debug(`Mistral createClient: model=${options.model}`);

      return new ChatMistralAI({
        model: options.model,
        apiKey,
      });
    },
    getTokenCountFallback: async (input, output, historyTokens) => ({
      prompt_tokens: numTokens(input) + historyTokens,
      completion_tokens: numTokens(output),
    }),
  },

  "custom-openai": {
    name: "Custom OpenAI",
    createClient: async (options, _settings) => {
      const transformedModel = fromCustomOpenAIModel(options.model);
      log.debug(
        `Custom OpenAI createClient: original=${options.model}, transformed=${transformedModel}`,
      );
      if (options.apiKey || options.endpoint) {
        return new ChatOpenAI({
          model: transformedModel,
          apiKey: options.apiKey,
          configuration: options.endpoint
            ? { baseURL: options.endpoint }
            : undefined,
        });
      }
      return await getCustomOpenAI(transformedModel);
    },
    canonicalModel: (model) => fromCustomOpenAIModel(model),
    getTokenCountFallback: async (input, output, historyTokens) => ({
      prompt_tokens: numTokens(input) + historyTokens,
      completion_tokens: numTokens(output),
    }),
  },
} as const satisfies Record<string, LLMProviderConfig>;

// Get provider config based on model
export function getProviderConfig(model: string): LLMProviderConfig {
  if (isOpenAIModel(model)) {
    return PROVIDER_CONFIGS.openai;
  } else if (isGoogleModel(model)) {
    return PROVIDER_CONFIGS.google;
  } else if (isAnthropicModel(model)) {
    return PROVIDER_CONFIGS.anthropic;
  } else if (isMistralModel(model)) {
    return PROVIDER_CONFIGS.mistral;
  } else if (isCustomOpenAI(model)) {
    return PROVIDER_CONFIGS["custom-openai"];
  } else {
    throw new Error(`Unknown model provider for: ${model}`);
  }
}

// Content processing helper
function content2string(content: any): string {
  if (typeof content === "string") {
    return content;
  } else if (Array.isArray(content)) {
    const output0 = content[0];
    if (output0?.type === "text") {
      return output0.text;
    }
  }

  log.debug("content2string unable to process", content);
  return "";
}

// Main unified evaluation function
export async function evaluateWithLangChain(
  options: LLMEvaluationOptions,
  mode: "cocalc" | "user" = "cocalc",
): Promise<ChatOutput> {
  const { input, system, history = [], model, stream, maxTokens } = options;

  log.debug("evaluateWithLangChain", {
    input,
    history,
    system,
    model,
    stream: stream != null,
    maxTokens,
  });

  // Get provider configuration
  const config = getProviderConfig(model);

  // Get server settings
  const settings = await getServerSettings();

  // Create LangChain client
  const client = await config.createClient(options, settings, mode);

  // Canonical model name
  const canonicalModel = config.canonicalModel
    ? config.canonicalModel(model)
    : model;

  // Determine system role (always use "history" for historyKey)
  const systemRole = config.getSystemRole
    ? config.getSystemRole(model)
    : "system";

  const historyMessagesKey = "history";

  // Create prompt template
  // For o1 models, omit the system message entirely since they don't support system roles
  const isO1 = isO1Model(canonicalModel);
  const prompt = isO1
    ? ChatPromptTemplate.fromMessages([
        new MessagesPlaceholder(historyMessagesKey),
        ["human", system ? `${system}\n\n{input}` : "{input}"],
      ])
    : ChatPromptTemplate.fromMessages([
        [systemRole, system ?? ""],
        new MessagesPlaceholder(historyMessagesKey),
        ["human", "{input}"],
      ]);

  const chain = prompt.pipe(client);

  let historyTokens = 0;

  // Set up chain with history
  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    config: { configurable: { sessionId: "ignored" } },
    inputMessagesKey: "input",
    historyMessagesKey,
    getMessageHistory: async () => {
      const { messageHistory, tokens } = await transformHistoryToMessages(
        history,
      );
      historyTokens = tokens;
      return messageHistory;
    },
  });

  let finalResult: AIMessageChunk | undefined;
  let output = "";

  if (stream) {
    // Streaming mode
    const chunks = await chainWithHistory.stream({ input });

    for await (const chunk of chunks) {
      const chunkTyped = chunk as AIMessageChunk;
      const { content } = chunkTyped;
      const contentStr = content2string(content);

      if (typeof content === "string") {
        output += content;
        stream(content);
      } else if (contentStr) {
        output += contentStr;
        stream(contentStr);
      }

      // Collect final result for usage metadata
      if (finalResult) {
        finalResult = concat(finalResult, chunkTyped);
      } else {
        finalResult = chunkTyped;
      }
    }
  } else {
    // Non-streaming mode
    finalResult = (await chainWithHistory.invoke({ input })) as AIMessageChunk;
    const { content } = finalResult;
    output = content2string(content);
  }

  stream?.(null);

  // Token counting - prefer usage_metadata, fallback to provider-specific method
  const usage_metadata = finalResult?.usage_metadata;
  log.debug("usage_metadata", usage_metadata);

  if (usage_metadata) {
    const { input_tokens, output_tokens, total_tokens } = usage_metadata;
    log.debug(`${config.name} successful (using usage_metadata)`, {
      input_tokens,
      output_tokens,
      total_tokens,
    });

    return {
      output,
      total_tokens,
      completion_tokens: output_tokens,
      prompt_tokens: input_tokens,
    };
  } else {
    // Fallback to provider-specific token counting
    const tokenCount = config.getTokenCountFallback
      ? await config.getTokenCountFallback(
          input,
          output,
          historyTokens,
          model,
          settings,
        )
      : {
          prompt_tokens: numTokens(input) + historyTokens,
          completion_tokens: numTokens(output),
        };

    log.debug(`${config.name} successful (using manual counting)`, tokenCount);

    return {
      output,
      total_tokens: tokenCount.prompt_tokens + tokenCount.completion_tokens,
      completion_tokens: tokenCount.completion_tokens,
      prompt_tokens: tokenCount.prompt_tokens,
    };
  }
}
