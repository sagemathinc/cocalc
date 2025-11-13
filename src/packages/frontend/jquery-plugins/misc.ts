/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import $ from "jquery";

export function init() {
  // @ts-ignore
  $.fn.hasParent = function (p) {
    // Returns a subset of items using jQuery.filter
    this.filter(function () {
      // Return truthy/falsey based on presence in parent
      // @ts-ignore
      return !!$(p).find(this).length;
    });
  };

  // @ts-ignore
  $.fn.exactly_cover = function (other) {
    this.each(function () {
      // @ts-ignore
      const elt = $(this);
      elt.offset(other.offset());
      elt.width(other.width());
      elt.height(other.height());
    });
  };

  // jQuery plugin that sets the innerHTML of an element and doesn't do anything with script tags;
  // in particular, doesn't explicitly remove and run them like jQuery does.
  // @ts-ignore
  $.fn.html_noscript = function (html: string) {
    this.each(function () {
      // @ts-ignore
      this.innerHTML = html;
      // @ts-ignore
      const t = $(this);
      t.find("script").remove();
    });
  };
}
