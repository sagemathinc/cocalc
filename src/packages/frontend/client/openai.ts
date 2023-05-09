/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as message from "@cocalc/util/message";
import { AsyncCall } from "./client";
import { redux } from "../app-framework";
import { delay } from "awaiting";
import type { History } from "@cocalc/frontend/misc/openai"; // do not import until needed -- it is HUGE!
import type { Model } from "@cocalc/util/db-schema/openai";

const DEFAULT_SYSTEM_PROMPT =
  "ASSUME THAT I HAVE FULL ACCESS TO COCALC AND I AM USING COCALC RIGHT NOW.  ENCLOSE ALL MATH IN $.  INCLUDE THE LANGUAGE DIRECTLY AFTER THE TRIPLE BACKTICKS IN ALL MARKDOWN CODE BLOCKS.";

export class OpenAIClient {
  private async_call: AsyncCall;

  constructor(async_call: AsyncCall) {
    this.async_call = async_call;
  }

  public async chatgpt({
    input,
    system = DEFAULT_SYSTEM_PROMPT,
    history,
    project_id,
    path,
    model,
    tag = "",
  }: {
    input: string;
    system?: string;
    history?: History;
    project_id?: string;
    path?: string;
    model?: Model;
    tag?: string;
  }): Promise<string> {
    if (!redux.getStore("projects").hasOpenAI(project_id)) {
      return `OpenAI support is not currently enabled ${
        project_id ? "in this project" : "on this server"
      }.`;
    }
    input = input.trim();
    if (!input || input == "test") {
      return "Great! What can I assist you with today?";
    }
    if (input == "ping") {
      await delay(1000);
      return "Pong";
    }
    // await delay(5000);
    // return "Test";
    const {
      numTokensUpperBound,
      truncateHistory,
      truncateMessage,
      MAX_CHATGPT_TOKENS,
    } = await import("@cocalc/frontend/misc/openai");
    // We leave some room for output, hence about 3000 instead of 4000 here:
    const maxTokens = MAX_CHATGPT_TOKENS - 1000;
    input = truncateMessage(input, maxTokens);
    const n = numTokensUpperBound(input);
    if (n >= maxTokens) {
      history = undefined;
    } else if (history != null) {
      history = truncateHistory(history, maxTokens - n);
    }
    // console.log("chatgpt", { input, system, history, project_id, path });
    const resp = await this.async_call({
      message: message.chatgpt({
        text: input,
        system,
        project_id,
        path,
        history,
        model,
        tag: `app:${tag}`,
      }),
    });
    return resp.text;
  }

  public async embeddings_search({
    input,
    filter,
    limit,
  }: {
    input: string;
    limit: number;
    filter?: object;
  }): Promise<string> {
    if (!redux.getStore("projects").hasOpenAI()) {
      throw Error("OpenAI support is not currently enabled on this server");
    }
    input = input.trim();
    const resp = await this.async_call({
      message: message.openai_embeddings_search({ input, filter, limit }),
    });
    return resp.matches;
  }

  public async embeddings_save(
    data: { payload: object; field: string }[]
  ): Promise<string[]> {
    if (!redux.getStore("projects").hasOpenAI()) {
      throw Error("OpenAI support is not currently enabled on this server");
    }
    const resp = await this.async_call({
      message: message.openai_embeddings_save({ data }),
    });
    return resp.ids;
  }

  public async embeddings_remove(
    data: { payload: object }[]
  ): Promise<string[]> {
    if (!redux.getStore("projects").hasOpenAI()) {
      throw Error("OpenAI support is not currently enabled on this server");
    }
    const resp = await this.async_call({
      message: message.openai_embeddings_remove({ data }),
    });
    return resp.ids;
  }

  public async embeddings_get(
    data: { payload: object }[],
    selector?: { include?: string[]; exclude?: string[] }
  ): Promise<{ id: string | number; payload: object }[]> {
    if (!redux.getStore("projects").hasOpenAI()) {
      throw Error("OpenAI support is not currently enabled on this server");
    }
    const resp = await this.async_call({
      message: message.openai_embeddings_get({ data, selector }),
    });
    return resp.points;
  }
}
