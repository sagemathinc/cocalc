/* Here we define a jQuery plugin that turns the old font-awesome css elements
   into react-rendered Icon's.  This is, of course, meant to be some temporary
   code until Jupyter classic and Sage worksheets are rewritten using React.
   Also, this is only defined when jQuery itself is defined.
*/

import { Icon } from "@cocalc/frontend/components/icon";
import ReactDOM from "react-dom";
declare var $: any;
console.log("define processIcons plugin?", typeof $);
$.fn.processIcons = function () {
  return this.each(function () {
    // @ts-ignore
    const that = $(this);
    for (const elt of that.find(".fa")) {
      for (const cls of elt.className.split(/\s+/)) {
        if (cls.startsWith("fa-")) {
          ReactDOM.render(
            <Icon name={cls.slice(3)} spin={cls == "fa-cocalc-ring"} />,
            elt
          );
          break;
        }
      }
    }
  });
};
