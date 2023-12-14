/*
Get openai client.
*/

import {
  DiscussServiceClient,
  TextServiceClient,
} from "@google-ai/generativelanguage";
import {
  GenerativeModel,
  GoogleGenerativeAI,
  InputContent,
} from "@google/generative-ai";
import { Configuration, OpenAIApi } from "openai";
const { GoogleAuth } = require("google-auth-library");

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { LanguageModel, model2vendor } from "@cocalc/util/db-schema/openai";
import { unreachable } from "@cocalc/util/misc";
import { ChatOutput, History, numTokens } from "./chatgpt";

const log = getLogger("openai:client");

declare var fetch;

const clientCache: { [key: string]: OpenAIApi | VertexAIClient } = {};

export default async function getClient(
  model?: LanguageModel,
): Promise<OpenAIApi | VertexAIClient> {
  const vendor = model == null ? "openai" : model2vendor(model);

  switch (vendor) {
    case "openai":
      const { openai_api_key: apiKey } = await getServerSettings();
      if (clientCache[apiKey]) {
        return clientCache[apiKey];
      }
      if (!apiKey) {
        log.warn("requested openai api key, but it's not configured");
        throw Error("openai not configured");
      }

      log.debug("creating openai client...");
      const configuration = new Configuration({ apiKey });
      const client = new OpenAIApi(configuration);
      clientCache[apiKey] = client;
      return client;

    case "google":
      const { google_vertexai_key } = await getServerSettings();
      const key = `google:${google_vertexai_key}-${model}`;
      if (clientCache[key]) {
        return clientCache[key];
      }
      if (!google_vertexai_key) {
        log.warn("requested google vertexai key, but it's not configured");
        throw Error("google vertexai not configured");
      }

      if (!model) {
        throw Error("this should never happen");
      }

      const vai = new VertexAIClient({ apiKey: google_vertexai_key }, model);
      clientCache[key] = vai;
      return vai;

    default:
      unreachable(vendor);
      throw new Error(`unknown vendor: ${vendor}`);
  }
}

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
    const geminiHistory: InputContent[] = history.map(({ role, content }) => ({
      // Note: there is no "system", this is supposed to be in the context
      role: role === "user" ? "user" : "model",
      parts: content,
    }));
    // TODO there is no context? hence enter it as the first user message
    const geminiContext: InputContent[] = context
      ? [
          {
            role: "user",
            parts: context,
          },
        ]
      : [];

    // we create a new model each time (model instances store the chat history!)
    const geminiPro: GenerativeModel = this.genAI.getGenerativeModel({
      model: "gemini-pro",
    });
    const chat = geminiPro.startChat({
      history: [...geminiContext, ...geminiHistory],
      generationConfig: { maxOutputTokens: maxTokens ?? 2048 },
    });

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
