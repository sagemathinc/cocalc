/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Some extra functionality that is made available in the command line console
for debugging and generally working with CoCalc.

For security reasons, only available in DEBUG mode (e.g,. when doing cc-in-cc dev),
not in production.

Security note: not easily exposing this to the global scope would make it harder
for an attacker who is eval'ing dangerous code in a Sage worksheet (say).
However, even if it were not exposed, the attacker could just do
   "conn = new Primus(url, opts)"
and make a Primus connection, and start sending/receiving messages.  This would work,
because the primus connection authenticates based on secure https cookies,
which are there.   So we could make everything painful and hard to program and
actually get zero security gain.

**CRITICAL:** If the smc object isn't defined in your Google Chrome console session,
you have to change the context to *top*!   See
http://stackoverflow.com/questions/3275816/debugging-iframes-with-chrome-developer-tools/8581276#8581276
*/

declare const DEBUG; //  this comes from webpack.
console.log("DEBUG = ", DEBUG);

import { IS_TOUCH } from "../feature";
import { redux } from "../app-framework";

declare global {
  interface Window {
    cocalc: any; // special support for debugging
    cc: any; // alias for "cocalc"
    eruda: any; // provides a debugger for mobile devices (iOS).
  }
}

export function setup_global_cocalc(client): void {
  if (!DEBUG) {
    return;
  }

  const cocalc : any = window.cc ?? {};
  cocalc.client = client;
  cocalc.misc = require("smc-util/misc");
  cocalc.immutable = require("immutable");
  cocalc.done = cocalc.misc.done;
  cocalc.sha1 = require("sha1");
  cocalc.prom_client = require("../prom-client");
  cocalc.schema = require("smc-util/schema");
  cocalc.redux = redux;
  cocalc.load_eruda = load_eruda;
  console.log(
    "DEBUG: Enabling extra CoCalc library functionality.  Type cocalc or cc.[tab]."
  );
  window.cocalc = window.cc = cocalc;

  if (IS_TOUCH) {
    // Debug mode and on a touch device: always load eruda so we
    // get a nice dev console!  This is very handy for iPad development.
    load_eruda();
  }
}

function load_eruda(): void {
  // -- e.g., iPad -- so make it possible to get a
  // devel console via https://github.com/liriliri/eruda
  // This pulls eruda from a CDN.
  const script = document.createElement("script");
  script.src = "//cdn.jsdelivr.net/npm/eruda";
  document.body.appendChild(script);
  script.onload = function () {
    window.eruda.init();
  };
}
