/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { notification } from "antd";
import { ReactElement } from "react";

import {
  defaults,
  hash_string,
  server_seconds_ago,
  server_time,
} from "@cocalc/util/misc";

import { webapp_client } from "./webapp-client";

type NotificationType = "error" | "default" | "success" | "info" | "warning";

const default_timeout: { [key: string]: number } = {
  error: 9,
  default: 6,
  success: 5,
  info: 7,
};

const last_shown = {};

interface AlertMessageOptions {
  type?: NotificationType;
  title?: string | ReactElement<any>;
  message?: string | ReactElement<any> | Error;
  block?: boolean;
  timeout?: number;
}

export function alert_message(opts: AlertMessageOptions = {}) {
  opts = defaults(opts, {
    type: "default",
    title: undefined,
    message: "",
    block: undefined,
    timeout: undefined, // time in seconds
  });

  if (opts.type == null) throw Error("bug"); // make typescript happy.

  if (opts.timeout == null) {
    let t: number | undefined = default_timeout[opts.type];
    if (t == null) {
      t = 5;
    }
    opts.timeout = t;
  }

  // Don't show the exact same alert message more than once per 5s.
  // This prevents a screen full of identical useless messages, which
  // is just annoying and useless.
  if (opts.message instanceof Error) {
    opts.message = `${opts.message}`;
  } else if (opts.message === "string") {
    const hash = hash_string(opts.message + opts.type);
    if (last_shown[hash] >= server_seconds_ago(5)) {
      return;
    }
    last_shown[hash] = server_time();
  }

  const f =
    opts.type == "default" ? notification.open : notification[opts.type];
  if (f == null) {
    alert(`BUG: Unknown alert_message type ${opts.type}.`);
    return;
  }

  f({
    message: opts.title != null ? opts.title : "",
    description: stripExcessiveError(opts.message),
    duration: opts.block ? 0 : opts.timeout,
  });

  if (opts.type === "error") {
    // Send the same error message to the backend hub so
    // that us developers know what errors people are hitting.
    // There really should be no situation where users *regularly*
    // get error alert messages.
    webapp_client.tracking_client.log_error(opts.message);
  }
}

// for testing/development
/*
alert_message({ type: "error", message: "This is an error" });
alert_message({ type: "default", message: "This is a default alert" });
alert_message({ type: "warning", message: "This is a warning alert" });
alert_message({ type: "success", message: "This is a success alert" });
alert_message({ type: "info", message: "This is an info alert" });
*/

function stripExcessiveError(s) {
  if (typeof s != "string") {
    return s;
  }
  s = s.trim();
  if (s.startsWith("Error: Error:")) {
    s = s.slice("Error: ".length);
  }
  return s;
}
