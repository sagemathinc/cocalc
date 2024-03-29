/**
 * This is a wrapper client for Google's Generative AI API.
 *
 * Right now, this is for Gemini Pro, based on https://ai.google.dev/tutorials/node_quickstart
 */

import { GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatMessageHistory } from "langchain/stores/message/in_memory";

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings";
import {
  GoogleModel,
  LanguageModel,
  isGoogleModel,
} from "@cocalc/util/db-schema/llm-utils";
import { ChatOutput, History } from "@cocalc/util/types/llm";

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
    stream?: (output?: string) => void;
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
    stream?: (output?: string) => void;
  }) {
    // This is a LangChain instance, we use it for chatting like we do with all the others
    // https://js.langchain.com/docs/integrations/chat/google_generativeai (also for safetey settings)
    const chat = new ChatGoogleGenerativeAI({
      modelName: model,
      apiKey: this.apiKey,
      maxOutputTokens: maxTokens,
      streaming: true,
    });

    // However, we also count tokens, and for that we use "gemini-pro" only
    const geminiPro: GenerativeModel = this.genAI.getGenerativeModel({
      model: "gemini-pro",
    });

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
      getMessageHistory: async (_) => {
        const chatHistory = new ChatMessageHistory();
        if (history) {
          let nextRole: "model" | "user" = "user";
          for (const { content } of history) {
            if (nextRole === "user") {
              await chatHistory.addMessage(new HumanMessage(content));
            } else {
              await chatHistory.addMessage(new AIMessage(content));
            }
            nextRole = nextRole === "user" ? "model" : "user";
          }
        }

        return chatHistory;
      },
    });

    const chunks = await chainWithHistory.stream({ input });

    let output = "";
    for await (const chunk of chunks) {
      const { content } = chunk;
      log.debug(typeof chunk, { content, chunk });

      if (typeof content !== "string") continue;
      output += content;
      stream?.(content);
    }

    // and an empty call when done
    stream?.();

    const { totalTokens: prompt_tokens } = await geminiPro.countTokens([
      input,
      system ?? "",
      ...history.map(({ content }) => content),
    ]);

    const { totalTokens: completion_tokens } = await geminiPro.countTokens(
      output,
    );

    return {
      output,
      total_tokens: prompt_tokens + completion_tokens,
      completion_tokens,
      prompt_tokens,
    };
  }
}
