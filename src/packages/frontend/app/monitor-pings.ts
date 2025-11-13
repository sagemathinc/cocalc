/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Monitor ping events from webapp_client and use them to set some
// ping state in the page store.

import { redux } from "../app-framework";
import { webapp_client } from "../webapp-client";

export function init_ping(): void {
  webapp_client.on("ping", (ping_time: number): void => {
    let ping_time_smooth = redux.getStore("page").get("avgping") ?? ping_time;

    // reset outside 3x
    if (ping_time > 3 * ping_time_smooth || ping_time_smooth > 3 * ping_time) {
      ping_time_smooth = ping_time;
    } else {
      const decay = 1 - Math.exp(-1);
      ping_time_smooth = decay * ping_time_smooth + (1 - decay) * ping_time;
    }
    redux.getActions("page").set_ping(ping_time, Math.round(ping_time_smooth));
  });
}
