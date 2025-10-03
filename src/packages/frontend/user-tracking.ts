/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Provide a typescript-friendly stable interface to user_tracking, so
// client code doesn't have to import webapp_client everywhere, and we can
// completely change this if we want.

import { redux } from "@cocalc/frontend/app-framework";
import {
  query,
  server_time,
} from "@cocalc/frontend/frame-editors/generic/client";
import { get_cookie } from "@cocalc/frontend/misc";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { uuid } from "@cocalc/util/misc";
import { version } from "@cocalc/util/smc-version";

import { ANALYTICS_COOKIE_NAME } from "@cocalc/util/consts";

export async function log(eventName: string, payload: any): Promise<void> {
  const central_log = {
    id: uuid(),
    event: `webapp-${eventName}`,
    value: {
      account_id: redux.getStore("account")?.get("account_id"),
      analytics_cookie: get_cookie(ANALYTICS_COOKIE_NAME),
      cocalc_version: version,
      ...payload,
    },
    time: server_time(),
  };

  try {
    await query({ query: { central_log } });
  } catch (err) {
    console.warn("WARNING: Failed to write log event -- ", central_log);
  }
}

// This function will never raise an exception -- instead it
// shows a warning in the console when it can't report to the backend.
export default async function track(
  event: string,
  value: object,
): Promise<void> {
  // Replace all dashes with underscores in the event argument for consistency
  event = event.replace(/-/g, "_");

  // console.log("user_tracking", event, value);
  try {
    await webapp_client.tracking_client.user_tracking(event, value);
  } catch {
    //console.warn("user_tracking", { event, value }, err);
  }
}
