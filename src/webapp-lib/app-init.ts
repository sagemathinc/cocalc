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
  const SITE_DESCR = CUSTOMIZE.site_description || "";
  document.title = `${NAME} – ${SITE_DESCR}`;
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
In the mean time, try switching to another browser or upating to the
latest version of your browser.
</div>`
    : "";
  return `<div><strong>Application Error:</strong> <code>${msg} @ ${lineNo}/${columnNo} of ${url}</code></div>
${explanation}
<pre>
${stack}
</pre>`;
}

/* We do "delete window.onerror" below for the follwoing reason.

When I merged this, the following always results in nonstop 100% cpu usage:

1. Open cocalc
2. Open a project.
3. Boom!

With the profiler on, it's this onerror that is being called repeatedly.
Maybe there is a bug in it that causes it to call itself and crash things.
That seems likely.  I've thus rewritten it so that is impossible, e.g., by
making it so that if it is triggered, it disables itself after running once.
*/

function handle_window_error(msg, url, lineNo, columnNo, error) {
  if (error == null) {
    // Sometimes this window.onerror gets called with error null.
    // We ignore that here.  E.g., this happens when you open
    // a project sometimes with this input:
    // {msg: "ResizeObserver loop limit exceeded", url: "https://cocalc.com/45f...44a1-b842-6eaf5ee07f8f/files/?session=default", lineNo: 0, columnNo: 0, error: null}
    return;
  }
  console.log("handle_window_error", { msg, url, lineNo, columnNo, error });
  window.onerror = null;
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
}

window.onerror = handle_window_error;

// magic code to load all webpack assets

// order matters!
const asset_names = ["fill", "css", "pdf.worker", "vendor", "smc"];

function pad(s: string, w: number, align: "left" | "right" = "left") {
  const f = Math.max(0, w - s.length);
  const fill = " ".repeat(f);
  if (align == "left") {
    return s + fill;
  } else {
    return fill + s;
  }
}

function delay(t): Promise<void> {
  return new Promise((done) => setTimeout(() => done(), t));
}

// initialize…
const loading_size: { [key: string]: number } = {};
const loading_info: { [key: string]: number } = {};
const loading_ok: { [key: string]: boolean } = {};
let loading_show: any = null;

// for chrome, be aware of https://bugs.chromium.org/p/chromium/issues/detail?id=463622
function show_loading_info() {
  let bars = "";
  const W = 30;
  for (const name of asset_names) {
    const size = loading_size[name];
    const info = loading_info[name];
    bars += `${pad(name, 20)}`;
    if (size != null && size != 0 && info != null && !isNaN(info)) {
      const width = Math.min(W, Math.round((W * info) / size));
      const bar = `[${"=".repeat(width)}>${" ".repeat(W - width)}]`;
      if (loading_ok[name] != null) {
        // set to 100%  ... it's not accurate what webpack tells us
        if (loading_ok[name]) loading_info[name] = loading_size[name];
        const msg = loading_ok[name] ? "DONE" : "FAIL";
        bars += `${bar} ( ${msg} )`;
      } else {
        // webpack tells us smaller files, at least in dev version
        // we just cap this at 100% ... if this is systematically wrong everywhere,
        // we could divide info by ~2.5.
        const pct = `${Math.min(100, Math.round((100 * info) / size))}`;
        bars += `${bar} ( ${pad(pct, 3, "right")}% )`;
      }
    } else {
      bars += `[${" ".repeat(W + 1)}]         `;
    }
    bars += "\n";
  }
  loading_show.innerHTML = bars;
}

function update_loading_info(name, info) {
  // sometimes, the progress indicator says 0
  if (info == 0) return;
  // console.log("update_loading_info", name, info, "size", loading_size[name]);
  loading_info[name] = info;
  show_loading_info();
}

function load_asset(name, url, hash): Promise<string> {
  return new Promise(function (done, err) {
    const req = new XMLHttpRequest();
    req.open("GET", `${url}?${hash}`);
    req.onload = function () {
      if (this.status >= 200 && this.status < 300) {
        // report 100%
        update_loading_info(name, req.responseText.length);
        done(req.responseText);
      } else {
        loading_ok[name] = false;
        err({
          status: this.status,
          statusText: req.statusText,
        });
      }
    };

    req.onerror = function () {
      loading_ok[name] = false;
      err({
        status: this.status,
        statusText: req.statusText,
      });
    };

    req.addEventListener("progress", function (_e) {
      // e.total is 0 if it isn't reported (no surprise with compression),
      // but we happen to know the size from webpack anyways ...
      // e.loaded gives us the bytes so far, but compressed ...
      update_loading_info(name, req.responseText.length);
    });
    req.send();
  });
}

type Chunks = { [key: string]: { size: number; entry: string; hash: string } };

async function load_assets(data) {
  const chunks: Chunks = JSON.parse(data);
  loading_show = document.getElementById("cocalc-assets-loading");

  // loading them in parallel ...
  const code: { [key: string]: Promise<string> } = {};
  try {
    for (const [name, chunk] of Object.entries(chunks)) {
      loading_size[name] = chunk.size;
      loading_info[name] = 0;
      code[name] = load_asset(name, chunk.entry, chunk.hash);
    }
    // we eval them in a well defined order: i.e. fill, then css, then vendor?, ...
    const names = Object.keys(code);
    // safety check
    names.forEach((n) => {
      if (asset_names.indexOf(n) == -1) throw new Error(`unknown asset ${n}`);
    });
    await names.forEach(async (name) => {
      await eval(await code[name]);
      loading_ok[name] = true;
      show_loading_info();
      await delay(1);
    });
  } catch (err) {
    // TODO most likely, load_asset failed. We tell the user about this.
    alert(`Error Code: ${err.message.status}: ${err.message.statusText}`);
  }
}
