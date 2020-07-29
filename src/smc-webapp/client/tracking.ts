/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { WebappClient } from "./client";
import * as message from "smc-util/message";

export class TrackingClient {
  private client: WebappClient;
  private log_error_cache: { [error: string]: number } = {};

  constructor(client: WebappClient) {
    this.client = client;
  }

  // Send metrics to the hub this client is connected to.
  // There is no confirmation or response that this succeeded,
  // which is fine, since dropping some metrics is fine.
  public send_metrics(metrics: object): void {
    this.client.hub_client.send(message.metrics({ metrics }));
  }

  public async user_tracking(evt: string, value: object): Promise<void> {
    await this.client.async_call({
      message: message.user_tracking({ evt, value }),
    });
  }

  public log_error(error: any): void {
    if (typeof error != "string") {
      error = JSON.stringify(error);
    }
    const last = this.log_error_cache[error];
    if (last != null && new Date().valueOf() - last <= 1000 * 60 * 15) {
      return;
    }
    this.log_error_cache[error] = new Date().valueOf();
    this.client.call({
      message: message.log_client_error({ error }),
    });
  }

  public async webapp_error(opts: object): Promise<void> {
    await this.client.async_call({ message: message.webapp_error(opts) });
  }
}
