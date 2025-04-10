/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// This should be the last code run on client application startup.

import $ from "jquery";
declare var COCALC_GIT_REVISION: string;

import { webapp_client } from "./webapp-client";
import { wrap_log } from "@cocalc/util/misc";

// import this specifically to cause th
import checkFeaturesEnabled from "@cocalc/frontend/misc/check-features-enabled";

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
      // @ts-ignore
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
        webapp_client.hub_client.get_signed_in_mesg(),
      );
    }
  }

  // enable logging
  wrap_log();

  // check for localStorage, etc.
  checkFeaturesEnabled();
}
