/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { React, redux } from "../../app-framework";
import { DEFAULT_FONT_SIZE } from "smc-util/db-schema/defaults";

// this doesn't react to font size changes. maybe at some point we want to...
function base_font_size() {
  const account = redux.getStore("account");
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
export function use_font_size_scaling(font_size: number): number {
  const [font_size_prev, set_font_size_prev] = React.useState<number>(
    DEFAULT_FONT_SIZE
  );
  const [scaling, set_scaling] = React.useState<number>(1);

  if (font_size != font_size_prev) {
    set_font_size_prev(font_size);
  } else {
    return scaling;
  }

  const base = base_font_size();
  set_scaling((font_size != null ? font_size : base) / base);
  return scaling;
}
