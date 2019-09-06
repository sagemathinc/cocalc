//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

// window? is so this can be imported in the backend for testing...
const $ = window !== null ? (window as any).$ : undefined;

import { redux } from "./app-framework";
import { NAME_SYSTEM, NotificationsActions } from "./system_notifications";

import {
  defaults,
  hash_string,
  server_seconds_ago,
  server_time
} from "smc-util/misc";

const { webapp_client } = require("./webapp_client");

const types = ["error", "default", "success", "info"];
type Severity = typeof types[number];

// used for system notifications
export interface Alert {
  time: any; // type time object ?
  title: string;
  text: string;
  delay: number; // seconds
  severity: Severity;
}

// seconds
const default_timeout: { [type in Severity]: number } = {
  error: 8,
  default: 4,
  success: 4,
  info: 6
};

if (typeof $ === "function") {
  $("#alert-templates").hide();
}

const last_shown = {};

// old api, used throughout cocalc, based on $.pnotify
interface AlertMessageOptions {
  type?: Severity;
  title?: string;
  message?: string;
  block?: boolean;
  timeout?: number; // seconds
}

export function alert_message(opts: AlertMessageOptions = {}) {
  opts = defaults(opts, {
    type: "default",
    title: undefined,
    message: defaults.required,
    block: undefined,
    timeout: undefined
  }); // time in seconds
  if (opts.type == null) throw Error("bug"); // make typescript happy.
  if (opts.timeout == null) {
    let t: number | undefined = default_timeout[opts.type];
    if (t == null) {
      t = 5;
    }
    opts.timeout = t;
  }

  if (typeof opts.message !== "string") {
    opts.message = `${opts.message}`;
  }

  // Don't show the exact same alert message more than once per 5s.
  // This prevents a screenful of identical useless messages, which
  // is just annoying and useless.
  const hash = hash_string(opts.message + opts.type);
  if (last_shown[hash] >= server_seconds_ago(5)) {
    return;
  }
  last_shown[hash] = server_time();

  if (opts.block == null) {
    if (opts.type === "error") {
      opts.block = true;
    } else {
      opts.block = false;
    }
  }

  if (!types.includes(opts.type)) {
    alert(`Unknown alert_message type ${opts.type}.`);
    return;
  }

  const title = opts.title != null ? opts.title : "";

  $.pnotify({
    title,
    type: opts.type,
    text: opts.message,
    nonblock: false,
    animation_speed: "fast",
    closer_hover: false,
    opacity: 0.9,
    delay: opts.timeout * 1000
  });

  if (opts.type === "error") {
    // Send the same error message to the backend hub so
    // that us developers know what errors people are hitting.
    // There really should be no situation where users *regularly*
    // get error alert messages.
    webapp_client.log_error(opts.message);
  }

  const system_notification_actions = redux.getActions<
    {},
    NotificationsActions
  >(NAME_SYSTEM);
  if (system_notification_actions == null) {
    console.error("system_notification_actions is not available");
    return;
  }

  system_notification_actions.create_alert({
    time: server_time(),
    title,
    text: opts.message,
    delay: opts.timeout * 1000,
    severity: opts.type
  });
}

// c = $("#alert-templates .alert-#{opts.type}").clone()

// if opts.block
//     c.addClass('alert-block')
// c.find(".message").text(opts.message)
// c.prependTo("#alert-messages")
// c.click(() -> $(this).remove())

// setTimeout((()->c.remove()), opts.timeout*1000)

function check_for_clock_skew() {
  const local_time = new Date().valueOf();
  const s = Math.ceil(
    Math.abs(webapp_client.server_time() - local_time) / 1000
  );
  if (s > 120) {
    return exports.alert_message({
      type: "error",
      timeout: 9999,
      message: `Your computer's clock is off by about ${s} seconds!  You MUST set it correctly then refresh your browser.  Expect nothing to work until you fix this.`
    });
  }
}

// Wait until after the page is loaded and clock sync'd before checking for skew.
setTimeout(check_for_clock_skew, 60000);

// for testing/development
// alert_message({type:'error',   message:"This is an error"})
// alert_message({type:'default', message:"This is a default alert"})
// alert_message({type:'success', message:"This is a success alert"})
// alert_message({type:'info',    message:"This is an info alert"})

// Make it so alert_message can be used by user code, e.g., in sage worksheets.
if (window !== null) {
  (window as any).alert_message = exports.alert_message;
}
