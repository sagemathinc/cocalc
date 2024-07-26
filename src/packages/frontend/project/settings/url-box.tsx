/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CopyToClipBoard } from "@cocalc/frontend/components";

export function URLBox() {
  let url = document.URL;
  const i = url.lastIndexOf("/settings");
  if (i !== -1) {
    url = url.slice(0, i);
  }
  // note -- use of Input below is completely broken on Firefox! Do not naively change this back!!!!
  return <CopyToClipBoard style={{ fontSize: "11px" }} value={url} />;
}
