/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as message from "@cocalc/util/message";
import { AsyncCall } from "./client";
import type { KernelSpec } from "@cocalc/jupyter/types";

export class JupyterClient {
  private async_call: AsyncCall;

  constructor(async_call: AsyncCall) {
    this.async_call = async_call;
  }

  public async kernels(project_id?: string): Promise<KernelSpec[]> {
    const resp = await this.async_call({
      message: message.jupyter_kernels({ project_id }),
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
    hash,
    tag = "",
    project_id,
    path,
  }: {
    input?: string;
    kernel?: string;
    history?: string[];
    hash?: string;
    tag?: string;
    project_id?: string;
    path?: string;
  }): Promise<{ output: object[]; time: Date; total_time_s: number } | null> {
    const resp = await this.async_call({
      message: message.jupyter_execute({
        hash,
        input,
        kernel,
        history,
        tag,
        project_id,
        path,
      }),
    });
    if (resp.error) {
      throw Error(resp.error);
    }
    return resp;
  }
}
