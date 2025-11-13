/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* Open ~/.snapshots directory.

- We call this Backups
- We will rewite this component with something better that gives
  just links to the info from backups about *this* file.
*/

import { Button } from "antd";
import { Icon } from "@cocalc/frontend/components";
import track from "@cocalc/frontend/user-tracking";

export function OpenSnapshots({ actions }) {
  return (
    <Button
      onClick={() => {
        actions.open_snapshots();
        track("snapshots", { action: "open", where: "time-travel" });
      }}
      title={
        "Open the file system snapshots of this project, which may also be helpful in recovering past versions."
      }
    >
      <Icon name={"life-ring"} /> Backups
    </Button>
  );
}
