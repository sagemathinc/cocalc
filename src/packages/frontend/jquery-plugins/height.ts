/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import $ from "jquery";

export function init() {
  // Expand element to be vertically maximal in height, keeping its current top position.
  // @ts-ignore
  $.fn.maxheight = function (opts: { offset?: number } = {}) {
    const offset = opts.offset ?? 0;
    this.each(function () {
      // @ts-ignore
      const elt = $(this);
      const h = $(window).height();
      if (h == null) {
        return;
      }
      const elt_offset = elt.offset();
      if (elt_offset == null) {
        return;
      }
      elt.height(h - elt_offset.top - offset);
    });
    return this;
  };
}
