/**
 * This is a wrapper client for Google's Generative AI API.
 *
 * Right now, this is for Gemini Pro, based on https://ai.google.dev/tutorials/node_quickstart
 */

import { GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai";
import { AIMessageChunk } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { concat } from "@langchain/core/utils/stream";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings";
import {
  GOOGLE_MODEL_TO_ID,
  GoogleModel,
  LanguageModel,
  isGoogleModel,
} from "@cocalc/util/db-schema/llm-utils";
import type { ChatOutput, History, Stream } from "@cocalc/util/types/llm";
import { transformHistoryToMessages } from "./chat-history";

const log = getLogger("llm:google-genai");

interface AuthMethods {
  apiKey?: string;
  serviceAccountJSON?: string;
}

export class GoogleGenAIClient {
  gcp_project_id?: string;
  genAI: GoogleGenerativeAI;
  apiKey: string;

  constructor(auth: AuthMethods, model: LanguageModel) {
    if (model === "text-bison-001" || model === "chat-bison-001") {
      throw new Error("Palm2 is no longer supported");
    } else if (isGoogleModel(model)) {
      if (auth.apiKey == null) {
        throw new Error(`API key for Google model "${model}" missing`);
      }
      this.apiKey = auth.apiKey;
      this.genAI = new GoogleGenerativeAI(auth.apiKey);
    } else {
      throw new Error(`unknown model: "${model}"`);
    }
  }

  // https://developers.generativeai.google/tutorials/chat_node_quickstart
  // https://ai.google.dev/tutorials/node_quickstart#multi-turn-conversations-chat
  async chat({
    model,
    system,
    history,
    input,
    maxTokens,
    stream,
  }: {
    model: GoogleModel;
    system?: string;
    history: History;
    input: string;
    maxTokens?: number;
    stream?: Stream;
  }): Promise<ChatOutput> {
    const settings = await getServerSettings();
    const { google_vertexai_enabled } = settings;

    if (!google_vertexai_enabled) {
      throw new Error(`Google AI integration is not enabled.`);
    }

    if (isGoogleModel(model)) {
      return this.chatGemini({
        model,
        system,
        history,
        input,
        maxTokens,
        stream,
      });
    }

    // everything else is not supported, and this error should never happen
    throw new Error(`GoogleGenAIClient: model "${model}" not supported`);
  }

  private async chatGemini({
    model,
    system,
    history,
    input,
    maxTokens,
    stream,
  }: {
    model: GoogleModel;
    system?: string;
    history: History;
    input: string;
    maxTokens?: number;
    stream?: Stream;
  }) {
    // we might have to translate the model name (stable!) to the particular ID on google's side (which could change)
    const modelName = GOOGLE_MODEL_TO_ID[model] ?? model;
    // This is a LangChain instance, we use it for chatting like we do with all the others
    // https://js.langchain.com/docs/integrations/chat/google_generativeai (also for safetey settings)
    const chat = new ChatGoogleGenerativeAI({
      model: modelName,
      apiKey: this.apiKey,
      maxOutputTokens: maxTokens,
      // Only enable thinking tokens for Gemini 2.5 models
      ...(modelName === "gemini-2.5-flash" || modelName === "gemini-2.5-pro"
        ? { maxReasoningTokens: 1024 }
        : {}),
      streaming: true,
    });

    // Token counting will be done using either usage_metadata or the actual model

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", system ?? ""],
      new MessagesPlaceholder("history"),
      ["human", "{input}"],
    ]);

    const chain = prompt.pipe(chat);

    const chainWithHistory = new RunnableWithMessageHistory({
      runnable: chain,
      config: { configurable: { sessionId: "ignored" } },
      inputMessagesKey: "input",
      historyMessagesKey: "history",
      getMessageHistory: async () => {
        const { messageHistory } = await transformHistoryToMessages(history);
        return messageHistory;
      },
    });

    const chunks = await chainWithHistory.stream({ input });

    let finalResult: AIMessageChunk | undefined;
    let output = "";
    for await (const chunk of chunks) {
      const { content } = chunk;
      if (typeof content !== "string") continue;
      output += content;
      stream?.(content);

      // Collect the final result to check for usage metadata
      if (finalResult) {
        finalResult = concat(finalResult, chunk);
      } else {
        finalResult = chunk;
      }
    }

    stream?.(null);

    // Check for usage metadata from LangChain first (more accurate, includes thinking tokens)
    const usage_metadata = finalResult?.usage_metadata;
    log.debug("usage_metadata", usage_metadata);
     console.log("usage_metadata", usage_metadata);

    if (usage_metadata) {
      const { input_tokens, output_tokens, total_tokens } = usage_metadata;
      log.debug("chatGemini successful (using usage_metadata)", {
        input_tokens,
        output_tokens,
        total_tokens,
        usage_metadata, // Log full metadata to see what other fields might be available
      });

      // For now, return the standard ChatOutput format
      // TODO: Consider extending ChatOutput interface to include thinking_tokens if available
      return {
        output,
        total_tokens,
        completion_tokens: output_tokens,
        prompt_tokens: input_tokens,
      };
    } else {
      // Fallback to manual token counting using the actual model (not hardcoded)
      const tokenCountingModel: GenerativeModel = this.genAI.getGenerativeModel(
        {
          model: modelName,
        },
      );

      const { totalTokens: prompt_tokens } =
        await tokenCountingModel.countTokens([
          input,
          system ?? "",
          ...history.map(({ content }) => content),
        ]);

      const { totalTokens: completion_tokens } =
        await tokenCountingModel.countTokens(output);

      log.debug("chatGemini successful (using manual counting)", {
        prompt_tokens,
        completion_tokens,
      });

      return {
        output,
        total_tokens: prompt_tokens + completion_tokens,
        completion_tokens,
        prompt_tokens,
      };
    }
  }
}
