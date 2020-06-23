/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";

export function URLBox() {
  let url = document.URL;
  const i = url.lastIndexOf("/settings");
  if (i !== -1) {
    url = url.slice(0, i);
  }
  // note -- use of Input below is completely broken on Firefox! Do not naively change this back!!!!
  return <pre style={{ fontSize: "11px" }}>{url}</pre>;
}
