/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This should be the last code run on client application startup.

declare var $: any;

declare var COCALC_GIT_REVISION: string;

import { webapp_client } from "./webapp-client";
import { wrap_log } from "@cocalc/util/misc";
import { get_browser, IS_MOBILE, IS_TOUCH } from "./feature";
import * as prom_client from "./prom-client";

export function init() {
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

  // enable logging
  wrap_log();

  // finally, record start time
  // TODO compute and report startup initialization time
  if (prom_client.enabled) {
    const browser_info_gauge = prom_client.new_gauge(
      "browser_info",
      "Information about the browser",
      ["browser", "mobile", "touch", "git_version"]
    );
    browser_info_gauge
      .labels(get_browser(), IS_MOBILE, IS_TOUCH, COCALC_GIT_REVISION ?? "N/A")
      .set(1);
    const initialization_time_gauge = prom_client.new_gauge(
      "initialization_seconds",
      "Time from loading app.html page until last.coffee is completely done"
    );
    initialization_time_gauge.set(
      (new Date().getTime() - (window as any).webapp_initial_start_time) / 1000
    );
  }
}
