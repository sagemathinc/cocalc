/**
 * This is a wrapper client for Google's Vertex AI
 *
 * Right now, this is for Gemini Pro, based on https://ai.google.dev/tutorials/node_quickstart
 */

import getLogger from "@cocalc/backend/logger";
import { LanguageModel } from "@cocalc/util/db-schema/openai";
import {
  DiscussServiceClient,
  TextServiceClient,
} from "@google-ai/generativelanguage";
import {
  GenerativeModel,
  GoogleGenerativeAI,
  InputContent,
} from "@google/generative-ai";
import { GoogleAuth } from "google-auth-library";
import { numTokens } from "./chatgpt-numtokens";
import { ChatOutput, History } from "./types";

const log = getLogger("llm:vertex-ai");

interface AuthMethods {
  apiKey?: string;
  serviceAccountJSON?: string;
}

export class VertexAIClient {
  gcp_project_id?: string;
  clientText: TextServiceClient;
  clientDiscuss: DiscussServiceClient;
  genAI: GoogleGenerativeAI;

  constructor(auth: AuthMethods, model: LanguageModel) {
    const authClient = this.getAuthClient(auth);
    if (model === "text-bison-001") {
      this.clientText = new TextServiceClient({ authClient });
    } else if (model === "chat-bison-001") {
      this.clientDiscuss = new DiscussServiceClient({ authClient });
    } else if (model === "gemini-pro") {
      if (auth.apiKey == null) {
        throw new Error("you must provide and API key for gemini pro");
      }
      this.genAI = new GoogleGenerativeAI(auth.apiKey);
    } else {
      throw new Error(`unknown model: ${model}`);
    }
  }

  private getAuthClient(auth: AuthMethods) {
    const { apiKey, serviceAccountJSON } = auth;
    if (typeof serviceAccountJSON === "string") {
      const sa = JSON.parse(serviceAccountJSON);
      this.gcp_project_id = sa.project_id;
      return new GoogleAuth().fromJSON(sa);
    } else if (typeof apiKey === "string" && apiKey.length > 1) {
      return new GoogleAuth().fromAPIKey(apiKey);
    } else {
      throw new Error("no google vertex ai key or service account json");
    }
  }

  // https://developers.generativeai.google/tutorials/text_node_quickstart
  async query({
    model,
    prompt,
    maxTokens,
  }: {
    model: "text-bison-001";
    prompt: string;
    maxTokens?: number;
  }) {
    // note: model must be text-bison-001
    if (model !== "text-bison-001") {
      throw new Error("model must be text-bison-001");
    }
    const resp = await this.clientText.generateText({
      model: `models/${model}`,
      prompt: {
        text: prompt,
      },
      maxOutputTokens: maxTokens ?? 1024,
    });

    log.debug("query/ vertex ai", resp);
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
    model: "chat-bison-001" | "gemini-pro";
    context?: string;
    history: History;
    input: string;
    maxTokens?: number;
    stream?: (output?: string) => void;
  }): Promise<ChatOutput> {
    switch (model) {
      case "chat-bison-001":
        return this.chatPalm2({ context, history, input, stream });

      case "gemini-pro":
        return this.chatGeminiPro({
          context,
          history,
          input,
          maxTokens,
          stream,
        });

      default:
        throw new Error(`model ${model} not supported`);
    }
  }

  private async chatGeminiPro({
    context,
    history,
    input,
    maxTokens,
    stream,
  }: {
    context?: string;
    history: History;
    input: string;
    maxTokens?: number;
    stream?: (output?: string) => void;
  }) {
    // TODO there is no context? hence enter it as the first model message
    const geminiContext: InputContent[] = context
      ? [
          { role: "user", parts: `SYSTEM CONTEXT:\n${context}` },
          { role: "model", parts: "OK" },
        ]
      : [];

    // reconstruct the history, which always starts with user and we alternate
    const geminiHistory: InputContent[] = [];
    let nextRole: "model" | "user" = "user";
    for (const { content } of history) {
      geminiHistory.push({ role: nextRole, parts: content });
      nextRole = nextRole === "user" ? "model" : "user";
    }

    // we make sure we end with role=model, to be ready for the user input
    if (
      geminiHistory.length > 0 &&
      geminiHistory[geminiHistory.length - 1].role === "user"
    ) {
      geminiHistory.push({ role: "model", parts: "" });
    }

    // we create a new model each time (model instances store the chat history!)
    const geminiPro: GenerativeModel = this.genAI.getGenerativeModel({
      model: "gemini-pro",
    });

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

  // ATTN: PaLM2 is deprecated and this is basically dead code
  private async chatPalm2({
    context,
    history,
    input,
    stream,
  }): Promise<ChatOutput> {
    const messages: { content: string }[] = (history ?? [])
      .filter(({ content }) => !!content)
      .map(({ content }) => {
        return {
          content,
        };
      });

    messages.push({ content: input });

    const result = await this.clientDiscuss.generateMessage({
      model: `models/chat-bison-001`,
      candidateCount: 1, // Optional. The number of candidate results to generate.
      prompt: {
        // optional, preamble context to prime responses
        context,
        // Required. Alternating prompt/response messages.
        messages,
      },
    });

    log.debug("chat/got response from vertex ai", result);

    const output = result[0].candidates?.[0]?.content;

    // Note (2023-12-08): for generating code, especially in jupyter, PaLM2 often returns nothing with a "filters":[{"reason":"OTHER"}] message
    // https://developers.generativeai.google/api/rest/generativelanguage/ContentFilter#BlockedReason
    // I think this is just a bug. If there is no reply, there is now a simple user-visible error message instead of nothing.
    if (!output) {
      throw new Error(
        "There was a problem processing the prompt. Try a different prompt or another language model.",
      );
    }

    // PaLM2: there is no streaming
    if (stream != null) {
      stream(output);
      stream();
    }

    // token estimation
    const system_tokens = numTokens(context ?? "");
    const input_all = (history ?? []).map(({ content }) => content).join("\n");
    const prompt_tokens = system_tokens + numTokens(input_all);
    const completion_tokens = numTokens(output ?? "");

    return {
      output,
      total_tokens: prompt_tokens + completion_tokens,
      completion_tokens,
      prompt_tokens,
    };
  }
}
