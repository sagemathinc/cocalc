/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { redux } from "../app-framework";
import { webapp_client } from "../webapp-client";

const prom_client = require("../prom-client"); // still on coffeescript
// import * as prom_client from "../prom-client";

export async function init_ping(): Promise<void> {
  // Wait until initial page load, etc., is fine since this is just listening for pings every minute or so.  Ensures everything is setup.
  await delay(50);
  let prom_ping_time: any = undefined,
    prom_ping_time_last: any = undefined;
  if (prom_client.enabled) {
    prom_ping_time = prom_client.new_histogram("ping_ms", "ping time", {
      buckets: [50, 100, 150, 200, 300, 500, 1000, 2000, 5000],
    });
    prom_ping_time_last = prom_client.new_gauge(
      "ping_last_ms",
      "last reported ping time"
    );
  }

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

    if (prom_client.enabled) {
      prom_ping_time?.observe(ping_time);
      prom_ping_time_last?.set(ping_time);
    }
  });
}
