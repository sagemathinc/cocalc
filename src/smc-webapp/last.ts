/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This should be the last code run on client application startup.

declare var $: any;
declare var MathJax: any;
declare var MATHJAX_URL: string;
declare var SMC_GIT_REV: string;

import { webapp_client } from "./webapp-client";
import { wrap_log } from "smc-util/misc";
import { get_browser, IS_MOBILE, IS_TOUCH } from "./feature";
const { mathjax_finish_startup } = require("./misc_page");

// see http://stackoverflow.com/questions/12197122/how-can-i-prevent-a-user-from-middle-clicking-a-link-with-javascript-or-jquery
// I have some concern about performance.
$(document).on("click", function (e) {
  if (e.button === 1 && $(e.target).hasClass("webapp-no-middle-click")) {
    e.preventDefault();
    e.stopPropagation(); // ?
  }
  // hide popover on click
  if (
    $(e.target).data("toggle") !== "popover" &&
    $(e.target).parents(".popover.in").length === 0
  ) {
    return $('[data-toggle="popover"]').popover("hide");
  }
});

if (webapp_client.hub_client.is_connected()) {
  // These events below currently (due to not having finished the react rewrite)
  // have to be emited after the page loads, but may happen before.
  webapp_client.emit("connected");
  if (webapp_client.hub_client.is_signed_in()) {
    webapp_client.emit(
      "signed_in",
      webapp_client.hub_client.get_signed_in_mesg()
    );
  }
}

// load the mathjax configuration before mathjax starts up
import { MathJaxConfig } from "smc-util/mathjax-config";
(window as any).MathJax = MathJaxConfig;

$("#smc-startup-banner")?.remove();
$("#smc-startup-banner-status")?.remove();
$("#cocalc-error-report-startup")?.remove();
$("#cocalc-assets-loading")?.remove();

$(function () {
  try {
    $(parent).trigger("initialize:frame");
  } catch (error) {}

  if (!MATHJAX_URL) {
    // This global variable MATHJAX_URL should be set by Webpack.
    console.log(
      "WARNING: MathJax rendering fallback is NOT enabled.  Only katex rendering is available for math formulas!"
    );
  } else {
    // mathjax startup. config is set above, now we dynamically insert the mathjax script URL
    const mjscript = document.createElement("script");
    mjscript.type = "text/javascript";
    mjscript.src = MATHJAX_URL;
    mjscript.onload = function () {
      // once loaded, we finalize the configuration and process pending rendering requests
      MathJax.Hub?.Queue([mathjax_finish_startup]);
    };
    document.getElementsByTagName("head")[0].appendChild(mjscript);
  }

  // enable logging
  wrap_log();

  // finally, record start time
  // TODO compute and report startup initialization time
  const prom_client = require("./prom-client");
  if (prom_client.enabled) {
    const browser_info_gauge = prom_client.new_gauge(
      "browser_info",
      "Information about the browser",
      ["browser", "mobile", "touch", "git_version"]
    );
    browser_info_gauge
      .labels(get_browser(), IS_MOBILE, IS_TOUCH, SMC_GIT_REV ?? "N/A")
      .set(1);
    const initialization_time_gauge = prom_client.new_gauge(
      "initialization_seconds",
      "Time from loading app.html page until last.coffee is completely done"
    );
    initialization_time_gauge.set(
      (new Date().getTime() - (window as any).webapp_initial_start_time) / 1000
    );
  }
});
