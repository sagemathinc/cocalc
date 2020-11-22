/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// first, load the customize endpoint → check if any images are customized and render banner accordingly. also use the proper name.
// if the endpoint doesn't work, we have a problem. report back accordingly…

declare const CUSTOMIZE: any;
declare const COCALC_ASSETS: string;
let HELP_EMAIL = "help@cocalc.com";

function email() {
  return `<a href="mailto:${HELP_EMAIL}" target="_blank" rel="noopener">${HELP_EMAIL}</a>`;
}

function script_error() {
  document.body.innerHTML =
    "<h1 style='text-align:center;margin-top:10vh'>Initialization problem. Please try again in a minute ...</h1>";
  window.stop();
}

// compact trottling with a trailing call, used for updating the progress bars
// credits: https://codeburst.io/throttling-and-debouncing-in-javascript-b01cad5c8edf
function throttle(fn, limit) {
  let lastFn;
  let lastRan;
  return function (...args) {
    if (!lastRan) {
      fn(...args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFn);
      lastFn = setTimeout(() => {
        if (Date.now() - lastRan >= limit) {
          fn(...args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
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
  Problem while loading ${NAME}.
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

// load customization once the DOM exists.
// then start downloading all cocalc assets...
document.addEventListener("DOMContentLoaded", function () {
  const customizeScript = document.createElement("script");
  customizeScript.onerror = script_error;
  customizeScript.onload = function () {
    style();
    load_assets();
  };
  document.head.appendChild(customizeScript);
  customizeScript.src = `${window.app_base_url}/customize?type=full`;
});

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

/* We do "window.onerror = null" below for the follwoing reason.

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
const asset_width = Math.max(...asset_names.map((x) => x.length));

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

interface Loading {
  err?: string;
  size: { [key: string]: number };
  loaded: { [key: string]: number };
  done: { [key: string]: boolean };
}

// initialize…
const loading: Loading = {
  size: {},
  loaded: {},
  done: {},
};

// will be a div element ...
let loading_output: HTMLElement | null = null;
const progress_bars: { [key: string]: HTMLElement } = {};
const progress_bars_span: { [key: string]: HTMLElement } = {};
let loading_msg: HTMLElement | null = null;

async function show_error(err) {
  if (typeof err === "string") {
    loading.err = `Error: ${err}`;
  } else {
    // this is a broken promise: most likely, load_asset failed. We tell the user about this.
    loading.err = `Error ${err.status}: ${err.statusText}`;
  }

  if (loading_output == null) return;
  loading_output.innerHTML = `Problem loading assets.\n${loading.err}`;
  loading_output.style["white-space"] = "pre-wrap";

  const err_box = document.querySelector(
    "#smc-startup-banner div.banner-error"
  );
  // https://github.com/microsoft/TypeScript/issues/3263#issuecomment-277894602
  if (err_box instanceof HTMLElement) {
    // we know for sure it is there
    err_box.style.opacity = "1";
  }
  ["cc-banner1", "cc-banner2"].forEach((id) => {
    const banner = document.getElementById(id);
    if (banner == null) return;
    banner.style.opacity = "1";
    banner.classList.add("banner-error");
  });
  const bottom_status = document.getElementById("smc-startup-banner-status");
  if (bottom_status != null) {
    bottom_status.innerHTML = "Error: aborting startup initialization";
  }
  // give it a sec to render, then abort all of this …
  await delay(10);
  window.stop(); // stops javascript
}

const DEFLATE_FACTOR = 2; // picked by observing in production, no deep insight
// calculate a progress bar for each asset
// the problem is, we use compression, nginx's streaming, or cloudlfare, ... ?
// in any case, there is no header for the total content size. hence the browser
// only knows the bytes it did transfer. that's why we multiply the known "info" value by DEFLATE_FACTOR.
// that's more or less ok.
// also, for chrome, be aware of https://bugs.chromium.org/p/chromium/issues/detail?id=463622
// and chrome, firfox and others might have subtle differences ...
async function show_loading() {
  if (loading.err != null) return;
  for (const name of asset_names) {
    const size = loading.size[name];
    const info = DEFLATE_FACTOR * loading.loaded[name];
    let msg = `${pad(name, asset_width + 1)} `;
    let pct = 0;
    if (size != null && size != 0 && info != null && !isNaN(info)) {
      if (loading.done[name] != null) {
        // set to 100%  ... it's not accurate what webpack tells us
        if (loading.done[name]) loading.loaded[name] = loading.size[name];
        msg += loading.done[name] ? "DONE" : "FAIL";
        pct = 100;
      } else {
        pct = Math.min(100, Math.round((100 * info) / size));
        const pct_str = `${pct}%`;
        msg += `${pad(pct_str, 4, "right")}`;
      }
    }
    progress_bars[name].setAttribute("data-label", msg);
    progress_bars_span[name].style.width = `${pct}%`;

    if (loading_msg != null) {
      const dones = Object.values(loading.done);
      const all_done = asset_names.length == dones.length;
      if (all_done && dones.every((v) => !!v)) {
        const NAME = CUSTOMIZE.site_name || "CoCalc";
        loading_msg.innerHTML = `Starting ${NAME} ...`;
      }
    }

    await delay(1);
  }
}

// create the progress bars
function init_loading_output(keys: string[]) {
  if (loading_output == null) return;
  for (const key of keys) {
    const span = document.createElement("span");
    span.className = "value";
    span.style.width = "0%";
    const bar = document.createElement("div");
    bar.className = "progress";
    bar.setAttribute("data-label", "0%");
    bar.appendChild(span);
    progress_bars[key] = bar;
    progress_bars_span[key] = span;
    loading_output.appendChild(bar);
  }
  loading_msg = document.createElement("pre");
  loading_output.appendChild(loading_msg);
}

function _update_loading(name, info) {
  // sometimes, the progress indicator says 0
  if (info == 0) return;
  // console.log("update_loading", name, info, "size", loading.size[name]);
  loading.loaded[name] = info;
  show_loading();
}

const update_loading = throttle(_update_loading, 10);

function load_asset(name, url, hash): Promise<string> {
  return new Promise(function (done, err) {
    const req = new XMLHttpRequest();
    req.open("GET", `${url}?${hash}`);

    req.onload = function () {
      if (this.status >= 200 && this.status < 300) {
        // report 100%
        update_loading(name, req.responseText.length);
        done(req.responseText);
      } else {
        loading.done[name] = false;
        err({
          status: this.status,
          statusText: req.statusText,
        });
      }
    };

    req.onerror = function () {
      loading.done[name] = false;
      err({
        status: this.status,
        statusText: req.statusText,
      });
    };

    req.addEventListener("progress", function (_e) {
      // e.total is 0 if it isn't reported (no surprise with compression),
      // but we happen to know the size from webpack anyways ...
      // e.loaded gives us the bytes so far, but compressed ...
      update_loading(name, req.responseText.length);
    });

    req.send();
  });
}

type Chunks = { [key: string]: { size: number; entry: string; hash: string } };

// load_assets is called after the customization script is loaded
// the point is: there is a potential race condition starting cocalc very quickly, before this is defined
async function load_assets() {
  const chunks: Chunks = JSON.parse(COCALC_ASSETS);
  delete window["COCALC_ASSETS"];
  loading_output = document.getElementById("cocalc-assets-loading");

  // loading them in parallel ...
  const code: { [key: string]: Promise<string | void> } = {};
  try {
    init_loading_output(Object.keys(chunks));
    for (const [name, chunk] of Object.entries(chunks)) {
      loading.size[name] = chunk.size;
      loading.loaded[name] = 0;
      code[name] = load_asset(name, chunk.entry, chunk.hash).catch((err) => {
        loading.done[name] = false;
        show_error(err);
      });
    }
    // we eval them in a well defined order: i.e. fill, then css, then vendor?, ...
    const names = Object.keys(code);
    // safety check
    names.forEach((n) => {
      if (asset_names.indexOf(n) == -1) throw new Error(`unknown asset ${n}`);
    });
    await names.forEach(async (name) => {
      const source_code = await code[name];
      if (loading.err != null) return;
      if (typeof source_code === "string") {
        loading.done[name] = true;
        await show_loading();
        await eval(source_code);
      } else {
        loading.done[name] = false;
      }
    });
  } catch (err) {
    show_error(err);
  }
}
