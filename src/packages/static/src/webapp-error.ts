/*

We do "window.onerror = null" below for the follwoing reason.

When I merged this, the following always results in nonstop 100% cpu usage:

1. Open cocalc
2. Open a project.
3. Boom!

With the profiler on, it's this onerror that is being called repeatedly.
Maybe there is a bug in it that causes it to call itself and crash things.
That seems likely.  I've thus rewritten it so that is impossible, e.g., by
making it so that if it is triggered, it disables itself after running once.
*/

import Crash from "./crash";
import CrashMessage from "./crash-message";
import React from "react";
// @ts-ignore
import * as ReactDOM from "react-dom";

function handle_window_error(msg, url, lineNo, columnNo, error) {
  if (error == null) {
    // Sometimes this window.onerror gets called with error null.
    // We ignore that here.  E.g., this happens when you open
    // a project sometimes with this input:
    // {msg: "ResizeObserver loop limit exceeded",
    // url: "https://cocalc.com/45f...44a1-b842-6eaf5ee07f8f/files/?session=default", lineNo: 0, columnNo: 0, error: null}
    return;
  }
  console.warn("handle_window_error", { msg, url, lineNo, columnNo, error });
  if (isWhitelisted({ msg, url, error })) {
    console.warn("handle_window_error -- whitelisted");
    return;
  }
  window.onerror = null; // only once!!
  const crash = document.getElementById("cocalc-react-crash");
  if (crash == null) return;
  crash.style.display = "block";

  let errorbox = document.getElementById("cocalc-error-report-startup");
  let showExplanation = true;
  if (errorbox == null) {
    // app did startup, hence the banner is removed from the DOM
    // instead, check if there is the react error report banner and insert it there!
    errorbox = document.getElementById("cocalc-error-report-react");
    showExplanation = false;
    if (errorbox == null) return;
  }
  const stack = error?.stack ?? "<no stacktrace>"; // note: we actually ignore error == null above.
  ReactDOM.render(
    React.createElement(CrashMessage, {
      msg,
      lineNo,
      columnNo,
      url,
      stack,
      showExplanation,
    }),
    errorbox
  );
}

export default function init() {
  // console.log("installing window error handler");
  // Add a banner in case react crashes (it will be revealed)
  ReactDOM.render(
    React.createElement(Crash),
    document.getElementById("cocalc-crash-container")
  );

  // Install error handler.
  window.onerror = handle_window_error;
}

export function startedUp() {
  const elt = document.getElementById("cocalc-error-report-startup");
  if (elt) {
    elt.remove();
  }
}

function isWhitelisted({ msg, url, error }): boolean {
  if (url.includes("darkreader")) {
    // darkreader causes "TypeError: Cannot read property 'cssRules' of null"
    // sometimes when editing PDF files previewed using PDFjs.  It's probably a complicated
    // issue involving PDFJS.
    return true;
  }
  msg = msg;
  error = error; // typescript
  return false;
}
