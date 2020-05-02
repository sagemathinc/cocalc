/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Apply various transformations to url's before downloading a file using the "+ New" from web thing:
This is useful, since people often post a link to a page that *hosts* raw content, but isn't raw
content, e.g., ipython nbviewer, trac patches, github source files (or repos?), etc.
*/

import { endswith, startswith } from "smc-util/misc2";
import { DNS } from "smc-util/theme";
const COCALC_SHARE_SERVER = `https://share.${DNS}/share/`;

// returns something like {command:'wget', args:['http://...']}
export function transform_get_url(
  url: string
): { command: string; args: string[] } {
  let args: string[], command: string;
  const URL_TRANSFORMS = {
    "http://trac.sagemath.org/attachment/ticket/":
      "http://trac.sagemath.org/raw-attachment/ticket/",
    "https://trac.sagemath.org/attachment/ticket/":
      "https://trac.sagemath.org/raw-attachment/ticket/",
    "http://nbviewer.jupyter.org/url/": "http://", // download from original source
    "http://nbviewer.jupyter.org/urls/": "https://",
    "https://nbviewer.jupyter.org/url/": "http://", // download from original source
    "https://nbviewer.jupyter.org/urls/": "https://",
    [COCALC_SHARE_SERVER]: COCALC_SHARE_SERVER + "raw/", // always download as raw
  };
  if (startswith(url, "https://github.com/")) {
    if (url.indexOf("/blob/") !== -1) {
      url = url
        .replace("https://github.com", "https://raw.githubusercontent.com")
        .replace("/blob/", "/");
      // issue #1818: https://github.com/plotly/python-user-guide → https://github.com/plotly/python-user-guide.git
    } else if (!endswith(url, ".git")) {
      const u = url.split("://")[1];
      if (u != null && u.split("/").length === 3) {
        url += ".git";
      }
    }
  }

  if (startswith(url, COCALC_SHARE_SERVER)) {
    // remove any query params, since they mess up the filename...
    const i = url.lastIndexOf("?");
    if (i != -1) {
      url = url.slice(0, i);
    }
  }

  if (startswith(url, "git@github.com:")) {
    command = "git"; // kind of useless due to host keys...
    args = ["clone", url];
  } else if (url.slice(url.length - 4) === ".git") {
    command = "git";
    args = ["clone", url];
  } else {
    // fall back
    for (const a in URL_TRANSFORMS) {
      const b = URL_TRANSFORMS[a];
      url = url.replace(a, b);
    } // only replaces first instance, unlike python.  ok for us.
    // special case, this is only for nbviewer.../github/ URLs
    if (startswith(url, "http://nbviewer.jupyter.org/github/")) {
      url = url.replace(
        "http://nbviewer.jupyter.org/github/",
        "https://raw.githubusercontent.com/"
      );
      url = url.replace("/blob/", "/");
    }
    command = "wget";
    args = [url];
  }

  return { command, args };
}
