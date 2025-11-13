/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import { redux } from "../../app-framework";
import { DEFAULT_FONT_SIZE } from "@cocalc/util/db-schema/defaults";

// this doesn't react to font size changes. maybe at some point we want to...
export function baseFontSize() {
  const account = redux?.getStore("account");
  if (account != null) {
    return account.get("font_size", DEFAULT_FONT_SIZE);
  } else {
    return DEFAULT_FONT_SIZE;
  }
}

// derive a scaling factor relative to the user's default font size
// regarding the returned floating point number:
// don't use "zoom: ...", which is not a standard property
// https://github.com/sagemathinc/cocalc/issues/4438
// instead, e.g.
// {
//    transform: `scale(${scaling})`,
//    transformOrigin: "center 0", // or "0 0"
//  }
// And yet, I'm using zoom and testing it on safari, firefox and chrome
// and it works well now-a-days.

export function use_font_size_scaling(font_size: number): number {
  return getScale(font_size);
}

export function getScale(fontSize: number): number {
  const base = baseFontSize();
  return (fontSize != null ? fontSize : base) / base;
}
