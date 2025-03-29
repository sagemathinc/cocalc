/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Navigation Buttons to:

 - first
 - move a step forward
 - move a step back
 - last
*/

import { Button, Space } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { TimeTravelActions } from "./actions";
import type { List } from "immutable";

interface Props {
  id: string;
  actions: TimeTravelActions;
  version0?: number;
  version1?: number;
  versions?: List<number>;
}

export function NavigationButtons({
  id,
  actions,
  version0,
  version1,
  versions,
}: Props) {
  if (versions == null || versions?.size == 0) {
    return null;
  }
  return (
    <Space.Compact style={{ display: "inline-flex" }}>
      <Button
        title={"First version"}
        onClick={() => actions.step(id, "first")}
        disabled={version0 == null || version0 <= versions.get(0)!}
      >
        <Icon name="backward" />
      </Button>
      <Button
        title={"Previous version"}
        onClick={() => actions.step(id, "prev")}
        disabled={version0 == null || version0 <= versions.get(0)!}
      >
        <Icon name="step-backward" />
      </Button>
      <Button
        title={"Next version"}
        onClick={() => actions.step(id, "next")}
        disabled={version1 == null || version1 >= versions.get(-1)!}
      >
        <Icon name="step-forward" />
      </Button>
      <Button
        title={"Most recent version"}
        onClick={() => actions.step(id, "last")}
        disabled={version1 == null || version1 >= versions.get(-1)!}
      >
        <Icon name="forward" />
      </Button>
    </Space.Compact>
  );
}
