/*
Get openai client.
*/

import {
  DiscussServiceClient,
  TextServiceClient,
} from "@google-ai/generativelanguage";
import { GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai";
import { Configuration, OpenAIApi } from "openai";
const { GoogleAuth } = require("google-auth-library");

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { LanguageModel, model2vendor } from "@cocalc/util/db-schema/openai";
import { unreachable } from "@cocalc/util/misc";
import { History } from "./chatgpt";

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
  async chat({
    model,
    context,
    history,
    input,
  }: {
    model: "chat-bison-001" | "gemini-pro";
    context?: string;
    history: History;
    input: string;
  }): Promise<string | null | undefined> {
    switch (model) {
      case "chat-bison-001":
        return this.chatPalm2({ context, history, input });

      case "gemini-pro":
        return this.chatGeminiPro({ context, history, input });

      default:
        throw new Error(`model ${model} not supported`);
    }
  }

  private async chatGeminiPro({ context, history, input }) {
    const geminiHistory = history.map(({ role, content }) => ({
      // Note: there is no "system", this is supposed to be in the context
      role: role === "user" ? "user" : "model",
      parts: content,
    }));
    1;
    // TODO there is no context? hence enter it as the first user message
    const geminiContext = context
      ? [
          {
            role: "user",
            parts: context,
          },
        ]
      : [];

    // we create a new model each time (it stores the chat history!)
    const geminiPro: GenerativeModel = this.genAI.getGenerativeModel({
      model: "gemini-pro",
    });
    const chat = geminiPro.startChat({
      history: [...geminiContext, ...geminiHistory],
      generationConfig: { maxOutputTokens: 2048 },
    });

    const result = await chat.sendMessage(input);
    const response = await result.response;
    const text = response.text();
    log.debug("chat/got response from gemini pro:", text);
    return text;
  }

  private async chatPalm2({
    context,
    history,
    input,
  }): Promise<string | undefined | null> {
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

    return result[0].candidates?.[0]?.content;
  }
}

/*

const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai-node");

const MODEL_NAME = "gemini-pro";
const API_KEY = "YOUR_API_KEY";

async function runChat() {
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const generationConfig = {
    temperature: 0.9,
    topK: 1,
    topP: 1,
    maxOutputTokens: 2048,
  };

  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ];

  const chat = model.startChat({
    generationConfig,
    safetySettings,
    history: [

    ],
  });

  const result = await chat.sendMessage("YOUR_USER_INPUT");
  const response = result.response;
  console.log(response.text());
}

runChat();

  */
