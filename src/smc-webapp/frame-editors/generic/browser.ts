import * as jQuery from "jquery";

export function is_safari(): boolean {
  let $: any = jQuery;
  if ($.browser !== undefined && $.browser.safari) {
    return true;
  } else {
    return false;
  }
}
