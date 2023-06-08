/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as message from "@cocalc/util/message";
import { redux } from "../app-framework";
import { delay } from "awaiting";
import type { History } from "@cocalc/frontend/misc/openai"; // do not import until needed -- it is HUGE!
import type { EmbeddingData, Model } from "@cocalc/util/db-schema/openai";
import {
  MAX_SEARCH_LIMIT,
  MAX_SAVE_LIMIT,
  MAX_REMOVE_LIMIT,
  MAX_EMBEDDINGS_TOKENS,
} from "@cocalc/util/db-schema/openai";
import { EventEmitter } from "events";
import type { WebappClient } from "./client";

const DEFAULT_SYSTEM_PROMPT =
  "ASSUME THAT I HAVE FULL ACCESS TO COCALC AND I AM USING COCALC RIGHT NOW.  ENCLOSE ALL MATH IN $.  INCLUDE THE LANGUAGE DIRECTLY AFTER THE TRIPLE BACKTICKS IN ALL MARKDOWN CODE BLOCKS.  BE BRIEF.";

interface EmbeddingsQuery {
  scope: string | string[];
  limit: number; // client automatically deals with large limit by making multiple requests (i.e., there is no limit on the limit)
  text?: string;
  filter?: object;
  selector?: { include?: string[]; exclude?: string[] };
  offset?: number | string;
}

export class OpenAIClient {
  private client: WebappClient;

  constructor(client: WebappClient) {
    this.client = client;
  }

  public async chatgpt(opts): Promise<string> {
    return await this.implementChatgpt(opts);
  }

  public chatgptStream(opts, startExplicitly = false): ChatStream {
    const chatStream = new ChatStream();
    (async () => {
      await this.implementChatgpt({ ...opts, chatStream });
      if (!startExplicitly) {
        chatStream.emit("start");
      }
    })();
    return chatStream;
  }

  private async implementChatgpt({
    input,
    model,
    system = DEFAULT_SYSTEM_PROMPT,
    history,
    project_id,
    path,
    chatStream,
    tag = "",
  }: {
    input: string;
    model: Model;
    system?: string;
    history?: History;
    project_id?: string;
    path?: string;
    chatStream?: ChatStream; // if given, uses chat stream
    tag?: string;
    startStreamExplicitly?: boolean;
  }): Promise<string> {
    if (!redux.getStore("projects").hasOpenAI(project_id, tag)) {
      return `OpenAI support is not currently enabled ${
        project_id ? "in this project" : "on this server"
      }.`;
    }
    input = input.trim();
    if (chatStream == null) {
      if (!input || input == "test") {
        return "Great! What can I assist you with today?";
      }
      if (input == "ping") {
        await delay(1000);
        return "Pong";
      }
    }
    const {
      numTokensUpperBound,
      truncateHistory,
      truncateMessage,
      getMaxTokens,
    } = await import("@cocalc/frontend/misc/openai");
    // We leave some room for output, hence about 3000 instead of 4000 here:
    const maxTokens = getMaxTokens(model) - 1000;
    input = truncateMessage(input, maxTokens);
    const n = numTokensUpperBound(input, getMaxTokens(model));
    if (n >= maxTokens) {
      history = undefined;
    } else if (history != null) {
      history = truncateHistory(history, maxTokens - n, model);
    }
    // console.log("chatgpt", { input, system, history, project_id, path });
    const mesg = message.chatgpt({
      text: input,
      system,
      project_id,
      path,
      history,
      model,
      tag: `app:${tag}`,
      stream: chatStream != null,
    });
    if (chatStream == null) {
      return (await this.client.async_call({ message: mesg })).text;
    }

    chatStream.once("start", () => {
      // streaming version
      this.client.call({
        message: mesg,
        error_event: true,
        cb: (err, resp) => {
          if (err) {
            chatStream.error(err);
          } else {
            chatStream.process(resp.text);
          }
        },
      });
    });

    return "see stream for output";
  }

  public async embeddings_search(
    query: EmbeddingsQuery
  ): Promise<{ id: string; payload: object }[]> {
    let limit = Math.min(MAX_SEARCH_LIMIT, query.limit);
    const result = await this.embeddings_search_call({ ...query, limit });

    if (result.length >= MAX_SEARCH_LIMIT) {
      // get additional pages
      while (true) {
        const offset =
          query.text == null ? result[result.length - 1].id : result.length;
        const page = await this.embeddings_search_call({
          ...query,
          limit,
          offset,
        });
        // Include the new elements
        result.push(...page);
        if (page.length < MAX_SEARCH_LIMIT) {
          // didn't reach the limit, so we're done.
          break;
        }
      }
    }
    return result;
  }

  private async embeddings_search_call({
    scope,
    limit,
    text,
    filter,
    selector,
    offset,
  }: EmbeddingsQuery) {
    text = text?.trim();
    const resp = await this.client.async_call({
      message: message.openai_embeddings_search({
        scope,
        text,
        filter,
        limit,
        selector,
        offset,
      }),
    });
    return resp.matches;
  }

  public async embeddings_save({
    project_id,
    path,
    data: data0,
  }: {
    project_id: string;
    path: string;
    data: EmbeddingData[];
  }): Promise<string[]> {
    this.assertHasNeuralSearch();
    const { truncateMessage } = await import("@cocalc/frontend/misc/openai");

    // Make data be data0, but without mutate data0
    // and with any text truncated to fit in the
    // embeddings limit.
    const data: EmbeddingData[] = [];
    for (const x of data0) {
      const { text } = x;
      if (typeof text != "string") {
        throw Error("text must be a string");
      }
      const text1 = truncateMessage(text, MAX_EMBEDDINGS_TOKENS);
      if (text1.length != text.length) {
        data.push({ ...x, text: text1 });
      } else {
        data.push(x);
      }
    }

    const ids: string[] = [];
    let v = data;
    while (v.length > 0) {
      const resp = await this.client.async_call({
        message: message.openai_embeddings_save({
          project_id,
          path,
          data: v.slice(0, MAX_SAVE_LIMIT),
        }),
      });
      ids.push(...resp.ids);
      v = v.slice(MAX_SAVE_LIMIT);
    }

    return ids;
  }

  public async embeddings_remove({
    project_id,
    path,
    data,
  }: {
    project_id: string;
    path: string;
    data: EmbeddingData[];
  }): Promise<string[]> {
    this.assertHasNeuralSearch();

    const ids: string[] = [];
    let v = data;
    while (v.length > 0) {
      const resp = await this.client.async_call({
        message: message.openai_embeddings_remove({
          project_id,
          path,
          data: v.slice(0, MAX_REMOVE_LIMIT),
        }),
      });
      ids.push(...resp.ids);
      v = v.slice(MAX_REMOVE_LIMIT);
    }

    return ids;
  }

  neuralSearchIsEnabled(): boolean {
    return !!redux.getStore("customize").get("neural_search_enabled");
  }

  assertHasNeuralSearch() {
    if (!this.neuralSearchIsEnabled()) {
      throw Error("OpenAI support is not currently enabled on this server");
    }
  }
}

class ChatStream extends EventEmitter {
  constructor() {
    super();
  }
  process(text?: string) {
    this.emit("token", text);
  }
  error(err) {
    this.emit("error", err);
  }
}

export type { ChatStream };
