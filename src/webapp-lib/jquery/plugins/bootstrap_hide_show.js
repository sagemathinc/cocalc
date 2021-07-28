/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as $ from "jquery";

const show = $.fn.show;
$.fn.show = function () {
  this.removeClass("hidden hide");
  return show.apply(this, arguments);
};
const hide = $.fn.hide;
$.fn.hide = function () {
  this.addClass("hidden hide");
  return hide.apply(this, arguments);
};
