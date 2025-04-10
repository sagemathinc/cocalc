/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// TODO: this is used by the two jquery-based editors: sage worksheets and jupyter
// rewrite those and get rid of this.

import $ from "jquery";
export const jQuery = $;

// @ts-ignore
$.fn.icon_spin = function (start: any, _disable: boolean = false) {
  if (typeof start === "object") {
    start = start.start;
  }
  this.each(function () {
    // @ts-ignore
    const elt = $(this);
    if (start) {
      elt.find(".fa-cocalc-ring").show();
      elt.find(".primary-icon").hide();
    } else {
      elt.find(".fa-cocalc-ring").hide();
      elt.find(".primary-icon").show();
    }
  });
  return this;
};
