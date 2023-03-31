/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as message from "@cocalc/util/message";
import { AsyncCall } from "./client";

export class JupyterClient {
  private async_call: AsyncCall;

  constructor(async_call: AsyncCall) {
    this.async_call = async_call;
  }

  public async execute({
    input,
    kernel,
    history,
    tag = "",
  }: {
    input: string;
    kernel: string;
    history?: string[];
    tag?: string;
  }): Promise<string> {
    console.log("jupyter execute", { input, kernel, history, tag });
    const resp = await this.async_call({
      message: message.jupyter_execute({
        input,
        kernel,
        history,
        tag,
      }),
    });
    return resp.output;
  }
}
