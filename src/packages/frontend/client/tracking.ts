/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { WebappClient } from "./client";
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
    // Master kill-switch: admin must enable user tracking site-wide.
    if (this.userTrackingEnabled != "yes") return;

    // When the cookie banner is enabled, additionally require the visitor
    // to have opted into the "usage" category. The admin setting is the
    // operator's say-so; the cookie banner is the user's. Both must agree
    // for the event to be recorded. Banner disabled by admin → existing
    // behaviour (admin setting alone gates).
    const customize = redux.getStore("customize");
    if (customize?.get("cookie_banner_enabled")) {
      const { hasCategoryConsent } = await import(
        "@cocalc/frontend/cookie-consent"
      );
      if (!hasCategoryConsent("usage")) return;
    }

    await this.client.conat_client.hub.system.userTracking({ event, value });
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
    (async () => {
      try {
        await this.client.conat_client.hub.system.logClientError({
          event: "error",
          error,
        });
      } catch (err) {
        console.log(`WARNING -- issue reporting error -- ${err}`);
      }
    })();
  };

  webapp_error = async (opts: object): Promise<void> => {
    await this.client.conat_client.hub.system.webappError(opts);
  };
}
