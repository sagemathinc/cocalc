/*
Get openai client.
*/

import { Configuration, OpenAIApi } from "openai";
import { TextServiceClient } from "@google-ai/generativelanguage";
import { DiscussServiceClient } from "@google-ai/generativelanguage";
const { GoogleAuth } = require("google-auth-library");

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { LanguageModel, model2vendor } from "@cocalc/util/db-schema/openai";
import { unreachable } from "@cocalc/util/misc";

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

  constructor(auth: AuthMethods, model: LanguageModel) {
    const authClient = this.getAuthClient(auth);
    if (model === "text-bison-001") {
      this.clientText = new TextServiceClient({ authClient });
    } else if (model === "chat-bison-001") {
      this.clientDiscuss = new DiscussServiceClient({ authClient });
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
    messages,
  }: {
    model: "chat-bison-001";
    context?: string;
    messages: { content: string }[];
  }): Promise<string | null | undefined> {
    // note: model must be chat-bison-001
    if (model !== "chat-bison-001") {
      throw new Error("model must be chat-bison-001");
    }
    const result = await this.clientDiscuss.generateMessage({
      model: `models/${model}`,
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
