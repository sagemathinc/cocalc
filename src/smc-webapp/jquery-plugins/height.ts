/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export const jQuery = $;
declare const $: any;

// Expand element to be vertically maximal in height, keeping its current top position.
$.fn.maxheight = function (opts: { offset?: number } = {}) {
  const offset = opts.offset ?? 0;
  this.each(function () {
    // @ts-ignore
    const elt = $(this);
    elt.height($(window).height() - elt.offset().top - offset);
  });
  return this;
};

// Use to workaround Safari flex layout bug https://github.com/philipwalton/flexbugs/issues/132
$.fn.make_height_defined = function () {
  this.each(function () {
    // @ts-ignore
    const elt = $(this);
    // Doing this makes the height **defined**, so that flexbox can use it even on safari.
    elt.height(elt.height());
  });
  return this;
};
