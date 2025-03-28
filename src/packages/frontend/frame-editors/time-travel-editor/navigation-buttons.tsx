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

interface Props {
  id: string;
  actions: TimeTravelActions;
  version0?: number;
  version1?: number;
  max: number;
}

export function NavigationButtons({
  id,
  actions,
  version0,
  version1,
  max,
}: Props) {
  return (
    <Space.Compact style={{ display: "inline-flex" }}>
      <Button
        title={"First version"}
        onClick={() => actions.step(id, -(version0 ?? 0))}
        disabled={version0 == null || version0 <= 0}
      >
        <Icon name="backward" />
      </Button>
      <Button
        title={"Previous version"}
        onClick={() => actions.step(id, -1)}
        disabled={version0 == null || version0 <= 0}
      >
        <Icon name="step-backward" />
      </Button>
      <Button
        title={"Next version"}
        onClick={() => actions.step(id, 1)}
        disabled={version1 == null || version1 >= max}
      >
        <Icon name="step-forward" />
      </Button>
      <Button
        title={"Most recent version"}
        onClick={() => actions.step(id, max - (version1 ?? 0))}
        disabled={version1 == null || version1 >= max}
      >
        <Icon name="forward" />
      </Button>
    </Space.Compact>
  );
}
