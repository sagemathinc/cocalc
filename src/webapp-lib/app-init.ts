/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// first, load the customize endpoint → check if any images are customized and render banner accordingly. also use the proper name.
// if the endpoint doesn't work, we have a problem. report back accordingly…

declare const CUSTOMIZE: any;
let HELP_EMAIL = "help@cocalc.com";

function email() {
  return `<a href="mailto:${HELP_EMAIL}" target="_blank" rel="noopener">${HELP_EMAIL}</a>`;
}

function script_error() {
  document.body.innerHTML =
    "<h1 style='text-align:center;margin-top:10vh'>Initialization problem. Please try again in a minute ...</h1>";
  window.stop();
}

function style() {
  const NAME = CUSTOMIZE.site_name || "CoCalc";
  HELP_EMAIL = CUSTOMIZE.help_email || "help@cocalc.com";
  document.title = NAME;
  const msg = document.getElementById("cc-message");
  if (msg == null) {
    // happens when loading is very quick and message is already removed
    return;
  }
  msg.innerHTML += `
  Timeout while loading ${NAME}.
  <br/>
  Try hitting shift and reload the page, restart your browser, or <a target="_blank" rel="noopener" href="https://doc.cocalc.com/howto/connectivity-issues.html">follow these steps</a>.
  If the problem persists, email ${email()}.`;
  if (CUSTOMIZE.logo_square || CUSTOMIZE.logo_rectangular) {
    const banner = document.getElementById("cc-banner2");
    if (banner == null) return;
    banner.style.display = "block";
    banner.innerHTML = `<img class="logo-square" src="${CUSTOMIZE.logo_square}">`;
    banner.innerHTML += `<img class="logo-rectangular" src="${CUSTOMIZE.logo_rectangular}">`;
  } else {
    const banner = document.getElementById("cc-banner1");
    if (banner == null) return;
    banner.style.display = "block";
  }
}

const customizeScript = document.createElement("script");
customizeScript.onerror = script_error;
customizeScript.onload = style;
document.head.appendChild(customizeScript);
customizeScript.src = `${window.app_base_url}/customize?type=embed`;

function error_msg({ msg, lineNo, columnNo, url, stack, show_explanation }) {
  const explanation = show_explanation
    ? `<div>
Please report the full error, your browser and operating system to ${email()}.
In the mean time, try switching to another browser or upating it to a newer version.
</div>`
    : "";
  return `<div><strong>Application Error:</strong> <code>${msg} @ ${lineNo}/${columnNo} of ${url}</code></div>
${explanation}
<pre>
${stack}
</pre>`;
}

window.onerror = function (msg, url, lineNo, columnNo, error) {
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
  const stack = error != null ? error.stack : "<no stacktrace>";
  errorbox.innerHTML = error_msg({
    msg,
    lineNo,
    columnNo,
    url,
    stack,
    show_explanation,
  });
};
