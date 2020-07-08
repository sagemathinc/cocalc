/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * lic
 */

// Provide a typescript-friendly stable interface to user_tracking, so
// client code doesn't have to import webapp_client everywhere, and we can
// completely change this if we want.

import { query, server_time } from "./frame-editors/generic/client";
import { uuid } from "../smc-util/misc2";
import { analytics_cookie_name as analytics } from "../smc-util/misc";
import { redux } from "./app-framework";
import { version } from "../smc-util/smc-version";
const { get_cookie } = require("./misc_page");
import { webapp_client } from "./webapp-client";

export async function log(eventName: string, payload: any): Promise<void> {
  const central_log = {
    id: uuid(),
    event: `webapp-${eventName}`,
    value: {
      account_id: redux.getStore("account")?.get("account_id"),
      analytics_cookie: get_cookie(analytics),
      cocalc_version: version,
      ...payload,
    },
    time: server_time(),
  };
  try {
    await query({
      query: {
        central_log,
      },
    });
  } catch (err) {
    console.warn("WARNING: Failed to write log event -- ", central_log);
  }
}

// This function should never raise an exception -- instead it
// shows a warning in the console.
export async function user_tracking(
  event: string,
  value: object
): Promise<void> {
  // console.log("user_tracking", event, value);
  try {
    await webapp_client.tracking_client.user_tracking(event, value);
  } catch (err) {
    console.warn("user_tracking", { event, value }, err);
  }
}
