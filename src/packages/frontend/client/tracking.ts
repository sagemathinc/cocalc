/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { WebappClient } from "./client";
import * as message from "@cocalc/util/message";
import { redux } from "@cocalc/frontend/app-framework";

export class TrackingClient {
  private client: WebappClient;
  private log_error_cache: { [error: string]: number } = {};
  private userTrackingEnabled?: string;

  constructor(client: WebappClient) {
    this.client = client;
  }

  user_tracking = async (event: string, value: object): Promise<void> => {
    if (this.userTrackingEnabled == null) {
      this.userTrackingEnabled = redux
        .getStore("customize")
        ?.get("user_tracking");
    }
    if (this.userTrackingEnabled == "yes") {
      await this.client.nats_client.hub.system.userTracking({ event, value });
    }
  };

  log_error = (error: any): void => {
    if (typeof error != "string") {
      error = JSON.stringify(error);
    }
    const last = this.log_error_cache[error];
    if (last != null && Date.now() - last <= 1000 * 60 * 15) {
      return;
    }
    this.log_error_cache[error] = Date.now();
    this.client.call({
      message: message.log_client_error({ error }),
    });
  };

  webapp_error = async (opts: object): Promise<void> => {
    await this.client.async_call({ message: message.webapp_error(opts) });
  };
}
