/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { CopyToClipBoard } from "../../r_misc";

export function URLBox() {
  let url = document.URL;
  const i = url.lastIndexOf("/settings");
  if (i !== -1) {
    url = url.slice(0, i);
  }
  // note -- use of Input below is completely broken on Firefox! Do not naively change this back!!!!
  return <CopyToClipBoard style={{ fontSize: "11px" }} value={url} />;
}
