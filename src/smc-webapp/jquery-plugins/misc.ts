/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export const jQuery = $;
declare var $: any;

$.fn.hasParent = function (p) {
  // Returns a subset of items using jQuery.filter
  return this.filter(function () {
    // Return truthy/falsey based on presence in parent
    // @ts-ignore
    return $(p).find(this).length;
  });
};

$.fn.exactly_cover = function (other) {
  return this.each(function () {
    // @ts-ignore
    const elt = $(this);
    elt.offset(other.offset());
    elt.width(other.width());
    elt.height(other.height());
  });
};

// jQuery plugin that sets the innerHTML of an element and doesn't do anything with script tags;
// in particular, doesn't explicitly remove and run them like jQuery does.
$.fn.html_noscript = function (html: string) {
  return this.each(function () {
    // @ts-ignore
    this.innerHTML = html;
    // @ts-ignore
    const t = $(this);
    t.find("script").remove();
    return t;
  });
};
