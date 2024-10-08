/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
