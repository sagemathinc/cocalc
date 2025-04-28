/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Sage worksheet viewer using only react.
This is what is also used by the share server.

We are currently not using this here, since 3d graphics don't
work, the look and feel is too different, and you can't copy
out a range.
*/

import { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import Worksheet from "../../sagews/worksheet";
import { parse_sagews } from "../../sagews/parse-sagews";

interface Props {
  syncdoc: SyncDoc; // syncdoc corresponding to a Sage worksheet
  version: number;
}

export function SageWorksheetHistory({ syncdoc, version }: Props) {
  const v = syncdoc.version(version);
  if (v == null) {
    return <span />;
  }
  const content: string = v.to_str();
  return (
    <div
      className="smc-vfill"
      style={{ overflowY: "scroll", margin: "30px 30px 0 30px" }}
    >
      <Worksheet sagews={parse_sagews(content)} />
    </div>
  );
}
