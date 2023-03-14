/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as message from "@cocalc/util/message";
import { AsyncCall } from "./client";

export class OpenAIClient {
  private async_call: AsyncCall;

  constructor(async_call: AsyncCall) {
    this.async_call = async_call;
  }

  public async chatgpt({
    input,
    project_id,
    path,
  }: {
    input: string;
    project_id?: string;
    path?: string;
  }): Promise<string> {
    const resp = await this.async_call({
      message: message.chatgpt({ text: input, project_id, path }),
    });
    return resp.text;
  }
}
