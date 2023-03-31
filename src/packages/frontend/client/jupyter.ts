/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as message from "@cocalc/util/message";
import { AsyncCall } from "./client";
import type { KernelSpec } from "@cocalc/frontend/jupyter/types";

export class JupyterClient {
  private async_call: AsyncCall;

  constructor(async_call: AsyncCall) {
    this.async_call = async_call;
  }

  public async kernels(): Promise<KernelSpec[]> {
    const resp = await this.async_call({
      message: message.jupyter_kernels({}),
    });
    if (resp.error) {
      throw Error(resp.error);
    }
    return resp.kernels;
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
    const resp = await this.async_call({
      message: message.jupyter_execute({
        input,
        kernel,
        history,
        tag,
      }),
    });
    if (resp.error) {
      throw Error(resp.error);
    }
    return resp.output;
  }
}
