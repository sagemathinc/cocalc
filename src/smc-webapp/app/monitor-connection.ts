/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Monitor connection-related events from webapp_client and use them to set some
// state in the page store.

import { delay } from "awaiting";
import { reuseInFlight } from "async-await-utils/hof";
import { redux } from "../app-framework";
import { SITE_NAME } from "smc-util/theme";
import { minutes_ago } from "smc-util/misc";
import { ConnectionStatus } from "./store";
import { alert_message } from "../alerts";
import { webapp_client } from "../webapp-client";

const DISCONNECTED_STATE_DELAY_MS = 5000;
const CONNECTING_STATE_DELAY_MS = 3000;

import { isMobile } from "../feature";

export async function init_connection() {
  // Wait until initial page load, etc to get all this connection monitoring going.
  await delay(50);
  const actions = redux.getActions("page");
  const store = redux.getStore("page");

  const recent_disconnects: number[] = [];
  function record_disconnect(): void {
    recent_disconnects.push(+new Date());
    if (recent_disconnects.length > 100) {
      // do not waste memory by deleting oldest entry:
      recent_disconnects.splice(0, 1);
    }
  }

  function num_recent_disconnects(minutes: number = 5): number {
    // note the "+", since we work with ms since epoch.
    const ago = +minutes_ago(minutes);
    return recent_disconnects.filter((x) => x > ago).length;
  }

  let reconnection_warning: null | number = null;

  // heartbeats are used to detect standby's (e.g. user closes their laptop).
  // The reason to record more than one is to take rapid re-firing
  // of the time after resume into account.
  const heartbeats: number[] = [];
  const heartbeat_N = 3;
  const heartbeat_interval_min = 1;
  const heartbeat_interval_ms = heartbeat_interval_min * 60 * 1000;
  function record_heartbeat() {
    heartbeats.push(+new Date());
    if (heartbeats.length > heartbeat_N) {
      heartbeats.slice(0, 1);
    }
  }
  setInterval(record_heartbeat, heartbeat_interval_ms);

  // heuristic to detect recent wakeup from standby:
  //   second last heartbeat older than (N+1)x the interval
  function recent_wakeup_from_standby(): boolean {
    return (
      heartbeats.length === heartbeat_N &&
      +minutes_ago((heartbeat_N + 1) * heartbeat_interval_min) > heartbeats[0]
    );
  }

  let actual_status: ConnectionStatus = store.get("connection_status");
  webapp_client.on("connected", () => {
    actual_status = "connected";
    actions.set_connection_status("connected", new Date());
  });

  const handle_disconnected = reuseInFlight(async () => {
    record_disconnect();
    const date = new Date();
    actions.set_ping(undefined, undefined);
    if (store.get("connection_status") == "connected") {
      await delay(DISCONNECTED_STATE_DELAY_MS);
    }
    if (actual_status == "disconnected") {
      // still disconnected after waiting the delay
      actions.set_connection_status("disconnected", date);
    }
  });

  webapp_client.on("disconnected", () => {
    actual_status = "disconnected";
    handle_disconnected();
  });

  webapp_client.on("connecting", () => {
    actual_status = "connecting";
    handle_connecting();
  });

  const handle_connecting = reuseInFlight(async () => {
    const date = new Date();
    if (store.get("connection_status") == "connected") {
      await delay(CONNECTING_STATE_DELAY_MS);
    }
    if (actual_status == "connecting") {
      // still connecting after waiting the delay
      actions.set_connection_status("connecting", date);
    }

    const attempt = webapp_client.hub_client.get_num_attempts();
    async function reconnect(msg) {
      // reset recent disconnects, and hope that after the reconnection the situation will be better
      recent_disconnects.length = 0; // see https://stackoverflow.com/questions/1232040/how-do-i-empty-an-array-in-javascript
      reconnection_warning = +new Date();
      console.log(
        `ALERT: connection unstable, notification + attempting to fix it -- ${attempt} attempts and ${num_recent_disconnects()} disconnects`
      );
      if (!recent_wakeup_from_standby()) {
        alert_message(msg);
      }
      webapp_client.hub_client.fix_connection();
      // Wait a half second, then remove one extra reconnect added by the call in the above line.
      await delay(500);
      recent_disconnects.pop();
    }

    console.log(
      `attempt: ${attempt} and num_recent_disconnects: ${num_recent_disconnects()}`
    );
    // NOTE: On mobile devices the websocket is disconnected every time one backgrounds
    // the application.  This normal and expected behavior, which does not indicate anything
    // bad about the user's actual network connection.  Thus displaying this error in the case
    // of mobile is likely wrong.  (It could also be right, of course.)
    const EPHEMERAL_WEBSOCKETS = isMobile.any();
    if (
      !EPHEMERAL_WEBSOCKETS &&
      (num_recent_disconnects() >= 2 || attempt >= 10)
    ) {
      // this event fires several times, limit displaying the message and calling reconnect() too often
      const SiteName = redux.getStore("customize").get("site_name") ?? SITE_NAME;
      if (
        reconnection_warning === null ||
        reconnection_warning < +minutes_ago(1)
      ) {
        if (num_recent_disconnects() >= 7 || attempt >= 20) {
          actions.set_connection_quality("bad");
          reconnect({
            type: "error",
            timeout: 10,
            message: `Your connection is unstable or ${SiteName} is temporarily not available.`,
          });
        } else if (attempt >= 10) {
          actions.set_connection_quality("flaky");
          reconnect({
            type: "info",
            timeout: 10,
            message: `Your connection could be weak or the ${SiteName} service is temporarily unstable. Proceed with caution.`,
          });
        }
      }
    } else {
      reconnection_warning = null;
      actions.set_connection_quality("good");
    }
  });

  webapp_client.on("new_version", actions.set_new_version);
}
