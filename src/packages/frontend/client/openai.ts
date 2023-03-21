/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as message from "@cocalc/util/message";
import { AsyncCall } from "./client";
import { redux } from "../app-framework";
import { delay } from "awaiting";
import type { History } from "@cocalc/frontend/misc/openai"; // do not import until needed -- it is HUGE!

const DEFAULT_SYSTEM_PROMPT =
  "ASSUME THAT I HAVE FULL ACCESS TO COCALC AND I AM USING COCALC RIGHT NOW.";

// We leave some room for output, hence about 3000 instead of 4000 here:
const MAX_CHATGPT_TOKENS = 3000;

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
  }: {
    input: string;
    system?: string;
    history?: History;
    project_id?: string;
    path?: string;
  }): Promise<string> {
    if (!redux.getStore("customize").get("openai_enabled")) {
      return "OpenAI support is not currently enabled on this server.";
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
    const { numTokens, truncateHistory, truncateMessage } = await import(
      "@cocalc/frontend/misc/openai"
    );
    const n = numTokens(input);
    if (n >= MAX_CHATGPT_TOKENS) {
      if (n > MAX_CHATGPT_TOKENS) {
        input = truncateMessage(input, MAX_CHATGPT_TOKENS);
      }
      history = undefined;
    } else {
      history =
        history != null
          ? truncateHistory(history, MAX_CHATGPT_TOKENS - numTokens(input))
          : undefined;
    }
    // console.log("chatgpt", { input, system, history, project_id, path });
    const resp = await this.async_call({
      message: message.chatgpt({
        text: input,
        system,
        project_id,
        path,
        history,
      }),
    });
    return resp.text;
  }
}
