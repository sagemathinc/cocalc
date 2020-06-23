/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";

import { defaults } from "smc-util/misc";

import { alert_message } from "../alerts";

interface WindowOpts {
  menubar?: "yes" | "no";
  toolbar?: "yes" | "no";
  resizable?: "yes" | "no";
  scrollbar?: "yes" | "no";
  width?: string;
  height?: string;
}

export function open_popup_window(url: string, opts: WindowOpts = {}) {
  return open_new_tab(url, true, opts);
}

// open new tab and check if user allows popups. if yes, return the tab -- otherwise show an alert and return null
export function open_new_tab(
  url: string,
  popup: boolean = false,
  opts: WindowOpts = {}
) {
  // if popup=true, it opens a smaller overlay window instead of a new tab (though depends on browser)

  let tab;
  opts = defaults(opts, {
    menubar: "yes",
    toolbar: "no",
    resizable: "yes",
    scrollbars: "yes",
    width: "800",
    height: "640",
  });

  if (popup) {
    const x: string[] = [];
    for (const k in opts) {
      const v = opts[k];
      if (v != null) {
        x.push(`${k}=${v}`);
      }
    }
    const popup_opts = x.join(",");
    tab = window.open("", "_blank", popup_opts);
  } else {
    tab = window.open("", "_blank");
  }

  if (tab == null || tab.closed == null || tab.closed) {
    // either tab isn't even defined (or doesn't have closed attribute) -- or already closed: then popup blocked
    let message;
    if (url) {
      message = (
        <span>
          Either enable popups for this website or{" "}
          <a href={url} target="_blank">
            click here.
          </a>
        </span>
      );
    } else {
      message = "Enable popups for this website and try again.";
    }

    alert_message({
      title: "Popups blocked.",
      message,
      type: "info",
      timeout: 15,
    });
    return null;
  }

  // equivalent to rel=noopener, i.e. neither tabs know about each other via window.opener
  // credits: https://stackoverflow.com/a/49276673/54236
  tab.opener = null;
  // only *after* the above, we set the URL!
  tab.location = url;
  return tab;
}
