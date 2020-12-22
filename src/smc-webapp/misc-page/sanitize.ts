/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This HTML sanitization is necessary in such a case, where the user enters
arbitrary HTML and then this HTML is added to the DOM. For example, a loose
open tag can cause the entire smc page to "crash", when it is inserted via
a chat message and show in the chat box as a message.
There are various tools available to do this, e.g.
* https://www.npmjs.com/package/sanitize-html (which depends on other utilitis, might be handy?)
* https://www.npmjs.com/package/sanitize or *-caja (from google, more standalone)
* https://www.npmjs.com/package/google-caja-sanitizer (only the google thing)
* another option: using <jQuery object>.html("<html>").html()

in any case, almost all tags should be allowed here, no need to be too strict.

FUTURE: the ones based on google-caja-sanitizer seem to have a smaller footprint,
but I (hsy) wasn't able to configure them in such a way that all tags/attributes are allowed.
It seems like there is some bug in the library, because the definitions to allow e.g. src in img are there.

http://api.jquery.com/jQuery.parseHTML/ (expanded behavior in version 3+)
*/

import { sanitize_html_attributes } from "smc-util/misc";
declare var jQuery: any;

export function sanitize_html(
  html: string,
  keepScripts: boolean = true,
  keepUnsafeAttributes: boolean = true,
  post_hook?: Function
): string {
  const sani = jQuery(
    jQuery.parseHTML("<div>" + html + "</div>", null, keepScripts)
  );
  if (!keepUnsafeAttributes) {
    sani.find("*").each(function (this: any) {
      return sanitize_html_attributes(jQuery, this);
    });
  }
  post_hook?.(sani);
  return sani.html();
}

export function sanitize_html_safe(html: string, post_hook?: Function): string {
  return sanitize_html(html, false, false, post_hook);
}
