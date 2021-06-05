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

import crash from "./crash.html";
import { HELP_EMAIL } from "smc-util/theme";

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
  window.onerror = null; // only once!!
  const crash = document.getElementById("cocalc-react-crash");
  if (crash == null) return;
  crash.style.display = "block";
  crash.style.zIndex = 100000; // instead of -10, so copy is possible (and it is more likely visible)
  let errorbox = document.getElementById("cocalc-error-report-startup");
  let show_explanation = true;
  if (errorbox == null) {
    // app did startup, hence the banner is removed from the DOM
    // instead, check if there is the react error report banner and insert it there!
    errorbox = document.getElementById("cocalc-error-report-react");
    show_explanation = false;
    if (errorbox == null) return;
  }
  errorbox.style.display = "block";
  const stack = error?.stack ?? "<no stacktrace>";  // note: we actually ignore error == null above.
  errorbox.innerHTML = error_msg({
    msg,
    lineNo,
    columnNo,
    url,
    stack,
    show_explanation,
  });
}

function error_msg({ msg, lineNo, columnNo, url, stack, show_explanation }) {
  const explanation = show_explanation
    ? `<div>
Please report the full error, your browser and operating system to ${email()}.
In the mean time, try switching to another browser or upating to the
latest version of your browser.
</div>`
    : "";
  return `<div><strong>Application Error:</strong> <code>${msg} @ ${lineNo}/${columnNo} of ${url}</code></div>
${explanation}
<pre style="overflow:auto">
${stack}
</pre>`;
}

export default function init() {
  console.log("installing window error handler");
  // Add a banner in case react crashes (it will be revealed)
  const div = document.createElement("div");
  div.innerHTML = crash.replace(/HELP_EMAIL/g, HELP_EMAIL);
  document.body.appendChild(div);
  // Handle any error.
  window.onerror = handle_window_error;
}
