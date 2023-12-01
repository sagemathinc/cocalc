/*
Get openai client.
*/

import { Configuration, OpenAIApi } from "openai";
const { TextServiceClient } = require("@google-ai/generativelanguage").v1beta2;
const { DiscussServiceClient } = require("@google-ai/generativelanguage");
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

      const vai = new VertexAIClient(google_vertexai_key, model);
      clientCache[key] = vai;
      return vai;

    default:
      unreachable(vendor);
      throw new Error(`unknown vendor: ${vendor}`);
  }
}

const VERTEX_AI_LOCATION = process.env.COCALC_VERTEX_AI_LOCATION || "us-east1";

export class VertexAIClient {
  gcp_project_id?: string;
  location = VERTEX_AI_LOCATION;
  client: any;

  constructor(
    auth: { apiKey?: string; serviceAccountJSON?: string },
    model: LanguageModel,
  ) {
    const { apiKey, serviceAccountJSON } = auth;
    const authClient = this.getAuthClient(apiKey, serviceAccountJSON);
    if (model === "text-bison-001") {
      this.client = new TextServiceClient({ authClient });
    } else if (model === "chat-bison-001") {
      this.client = new DiscussServiceClient({ authClient });
    } else {
      throw new Error(`unknown model: ${model}`);
    }
  }

  private getAuthClient(apiKey?: string, serviceAccountJSON?: string) {
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
    const resp = await this.client.generateText({
      model: `models/${model}`,
      prompt: {
        text: prompt,
      },
      max_output_tokens: maxTokens ?? 1024,
    });

    log.debug("got response from vertex ai", resp);
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
  }): Promise<string> {
    // note: model must be chat-bison-001
    const result = await this.client.generateMessage({
      model: `models/${model}`,
      candidateCount: 1, // Optional. The number of candidate results to generate.
      prompt: {
        // optional, preamble context to prime responses
        context,
        // Required. Alternating prompt/response messages.
        messages,
      },
    });

    log.debug("got response from vertex ai", result);

    return result[0].candidates[0].content;
  }
}
