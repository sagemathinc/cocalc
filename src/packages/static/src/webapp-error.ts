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
import { createRoot } from "react-dom/client";

function handleError(event) {
  if (event.defaultPrevented) {
    // see https://github.com/sagemathinc/cocalc/issues/5963
    return;
  }
  const { message: msg, filename: url, lineno, colno, error } = event;
  if (error == null) {
    // Sometimes this window.onerror gets called with error null.
    // We ignore that here.  E.g., this happens when you open
    // a project sometimes with this input:
    // {msg: "ResizeObserver loop limit exceeded",
    // url: "https://cocalc.com/45f...44a1-b842-6eaf5ee07f8f/files/?session=default", lineno: 0, colno: 0, error: null}
    return;
  }
  console.warn("handleError", { msg, url, lineno, colno, error });
  if (isWhitelisted({ error })) {
    console.warn("handleError -- whitelisted");
    return;
  }
  window.onerror = null; // only once!!
  const crash = document.getElementById("cocalc-react-crash");
  if (crash == null) return;
  crash.style.display = "block";

  let errorbox = document.getElementById("cocalc-error-report-startup");
  let showLoadFail = true;
  if (errorbox == null) {
    // app did startup, hence the banner is removed from the DOM
    // instead, check if there is the react error report banner and insert it there.
    errorbox = document.getElementById("cocalc-error-report-react");
    showLoadFail = false;
    if (errorbox == null) return;
  }
  const stack = error?.stack ?? "<no stacktrace>"; // note: we actually ignore error == null above.
  console.warn({ errorbox }, "rendering", { msg, lineno });
  createRoot(errorbox).render(
    React.createElement(CrashMessage, {
      msg,
      lineNo: lineno,
      columnNo: colno,
      url,
      stack,
      showLoadFail,
    }),
  );
}

export default function init() {
  // console.log("installing window error handler");
  // Add a banner in case react crashes (it will be revealed)
  const crashContainer = document.getElementById("cocalc-crash-container");
  if (crashContainer != null) {
    createRoot(crashContainer).render(React.createElement(Crash));
  } else {
    throw Error(
      "there must be a div with id cocalc-crash-container in the document!",
    );
  }

  // Install error handler.
  window.addEventListener("error", handleError);
}

export function startedUp() {
  const elt = document.getElementById("cocalc-error-report-startup");
  if (elt) {
    elt.remove();
  }
}

function isWhitelisted({ error }): boolean {
  try {
    if (
      error?.stack?.includes("jupyter/output-messages") ||
      error?.stack?.includes("jupyterGetElt") ||
      error?.stack?.includes("run_inline_js")
    ) {
      // see https://github.com/sagemathinc/cocalc/issues/7993
      // we should never show a popup cocalc crash when a jupyter message results
      // in a crash, since this is user level code.
      // "jupyter/output-messages" only works in dev mode, whereas jupyterGetElt works in prod.
      return true;
    }
    if (error?.stack?.includes("TypeError: $(...).")) {
      // see https://github.com/sagemathinc/cocalc/issues/7993
      // Getting Application Error: Uncaught TypeError: $(...).popover is not a function when opening old plotly
      // notebook used elsewhere.  It's somehow assuming jquery?  Just running it will then work.
      return true;
    }
    if (error?.stack?.includes("Bokeh")) {
      // see https://github.com/sagemathinc/cocalc/issues/6507
      return true;
    }

    if (error?.stack?.includes("modifySheet")) {
      // darkreader causes errors sometimes when editing PDF files previewed using PDFjs, and often when
      // trying to mess with MathJax. The error on both Firefox and Chrome includes "modifySheet" in the
      // stacktrace, since that's the function that causes the problem, and fortunately the name isn't
      // minified out, so that is what we whitelist.
      // Whitelisting this is fine, since darkreader is cosmetic.
      return true;
    }
    if (error?.stack?.includes("codemirror/addon/edit/closetag")) {
      // This closetag codemirror addon sometimes crashes; it's harmless, but scary.  This will probably
      // get automatically fixed when we upgrade to codemirror 6.
      return true;
    }
    if (
      error?.stack?.includes("jquery.js") ||
      error?.stack?.includes("N.slice is not a function")
    ) {
      // we can't do anything about errors deep in jquery...
      // e.g., one thing that causes this: https://sagemathcloud.zendesk.com/agent/tickets/17324
      // Steps to reproduce:
      // - Open any TeX document
      // - Split vertically the view and set the right view to PDF - native
      // - Enable "Build on save"
      // - Make any edit to your latex file
      // - Save
      // - Move your mouse to the pdf view
      return true;
    }
    if (
      error?.stack?.includes("xterm-addon-webgl") ||
      error.stack?.include("reading 'loadCell'")
    ) {
      // ranodmly happens sometimes with webgl based terminal, but then it still works fine.
      return true;
    }
    return false;
  } catch (_err) {
    // if anything is wrong with checking above, still show error.
    return false;
  }
}
