/**
 * This is a wrapper client for Google's Generative AI API.
 *
 * Right now, this is for Gemini Pro, based on https://ai.google.dev/tutorials/node_quickstart
 */

import {
  Content,
  GenerativeModel,
  GoogleGenerativeAI,
} from "@google/generative-ai";

import getLogger from "@cocalc/backend/logger";
import {
  GoogleModel,
  LanguageModel,
  isGoogleModel,
} from "@cocalc/util/db-schema/llm-utils";
import { ChatOutput, History } from "@cocalc/util/types/llm";

const log = getLogger("llm:vertex-ai");

interface AuthMethods {
  apiKey?: string;
  serviceAccountJSON?: string;
}

export class VertexAIClient {
  gcp_project_id?: string;
  genAI: GoogleGenerativeAI;

  constructor(auth: AuthMethods, model: LanguageModel) {
    if (model === "text-bison-001" || model === "chat-bison-001") {
      throw new Error("Palm2 is no longer supported");
    } else if (isGoogleModel(model)) {
      if (auth.apiKey == null) {
        throw new Error(`API key for Google model "${model}" missing`);
      }
      this.genAI = new GoogleGenerativeAI(auth.apiKey);
    } else {
      throw new Error(`unknown model: "${model}"`);
    }
  }

  // https://developers.generativeai.google/tutorials/chat_node_quickstart
  // https://ai.google.dev/tutorials/node_quickstart#multi-turn-conversations-chat
  async chat({
    model,
    context,
    history,
    input,
    maxTokens,
    stream,
  }: {
    model: GoogleModel;
    context?: string;
    history: History;
    input: string;
    maxTokens?: number;
    stream?: (output?: string) => void;
  }): Promise<ChatOutput> {
    // we assume all GOOGLE_MODELS are supported by their API client – a sensible assumption
    if (isGoogleModel(model)) {
      return this.chatGemini({
        model,
        context,
        history,
        input,
        maxTokens,
        stream,
      });
    }

    // everything else is not supported, and this error should never happen
    throw new Error(`model "${model}" not supported`);
  }

  private async chatGemini({
    model,
    context,
    history,
    input,
    maxTokens,
    stream,
  }: {
    model: GoogleModel;
    context?: string;
    history: History;
    input: string;
    maxTokens?: number;
    stream?: (output?: string) => void;
  }) {
    // TODO there is no context? hence enter it as the first model message
    const geminiContext: Content[] = context
      ? [
          { role: "user", parts: [{ text: `SYSTEM CONTEXT:\n${context}` }] },
          { role: "model", parts: [{ text: "OK" }] },
        ]
      : [];

    // reconstruct the history, which always starts with user and we alternate
    const geminiHistory: Content[] = [];
    let nextRole: "model" | "user" = "user";
    for (const { content } of history) {
      geminiHistory.push({ role: nextRole, parts: [{ text: content }] });
      nextRole = nextRole === "user" ? "model" : "user";
    }

    // we make sure we end with role=model, to be ready for the user input
    if (
      geminiHistory.length > 0 &&
      geminiHistory[geminiHistory.length - 1].role === "user"
    ) {
      geminiHistory.push({ role: "model", parts: [{ text: "" }] });
    }

    // we create a new model each time (model instances store the chat history!)
    const geminiPro: GenerativeModel = this.genAI.getGenerativeModel({ model });

    const params = {
      history: [...geminiContext, ...geminiHistory],
      generationConfig: { maxOutputTokens: maxTokens ?? 2048 },
    };

    log.debug("chat/gemini pro request", params);

    const chat = geminiPro.startChat(params);

    const { totalTokens: prompt_tokens } = await geminiPro.countTokens([
      input,
      context ?? "",
      ...history.map(({ content }) => content),
    ]);

    let text = "";
    if (stream != null) {
      // https://ai.google.dev/tutorials/node_quickstart#streaming
      const result = await chat.sendMessageStream(input);

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        text += chunkText;
        stream(chunkText);
      }
      // we block on the for loop above, hence now we are complete and send an empty reply to signal the end
      stream();
    } else {
      const result = await chat.sendMessage(input);
      const response = await result.response;
      text = response.text();
    }
    log.debug("chat/got response from gemini pro:", text);

    const { totalTokens: completion_tokens } = await geminiPro.countTokens(
      text,
    );
    return {
      output: text,
      total_tokens: prompt_tokens + completion_tokens,
      completion_tokens,
      prompt_tokens,
    };
  }
}
