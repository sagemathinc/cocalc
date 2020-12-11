/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

$.fn.hasParent = function (p) {
  // Returns a subset of items using jQuery.filter
  return this.filter(function () {
    // Return truthy/falsey based on presence in parent
    return $(p).find(this).length;
  });
};
