/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export const jQuery = $;
declare var $: any;
import { defaults } from "smc-util/misc";

$.fn.icon_spin = function (start: any, disable: boolean = false) {
  // when disable=true, additionally the disable-class will be added
  // don't forget to also tell it to remove later (unless it should stay disabled)
  let delay;
  if (typeof start === "object") {
    ({ start, delay } = defaults(start, {
      start: true,
      delay: 0,
    }));
  } else {
    delay = 0;
  }
  this.each(function () {
    // @ts-ignore
    const elt = $(this);
    if (start) {
      if (elt.data("fa-spin") != null) {
        // means that there is a timeout that hasn't gone off yet
        return;
      }
      const f = () => {
        if (disable) {
          elt.addClass("disabled");
        }
        elt.data("fa-spin", null);
        if (elt.find("i.fa-spinner").length === 0) {
          // fa-spin
          elt.append(
            "<span class='cocalc-icon-spin'><i class='fa fa-spinner' style='margin-left:1em'> </i></span>"
          );
          elt.find("i.fa-spinner").addClass("fa-spin");
        }
      };
      if (delay) {
        elt.data("fa-spin", setTimeout(f, delay));
      } else {
        f();
      }
    } else {
      if (disable) {
        elt.removeClass("disabled");
      }
      const t = elt.data("fa-spin");
      if (t != null) {
        clearTimeout(t);
        elt.data("fa-spin", null);
      }
      elt.find(".cocalc-icon-spin").remove();
    }
  });
  return this;
};
