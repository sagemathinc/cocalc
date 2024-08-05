/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { TimeTravelActions } from "./actions";
import { Icon } from "../../components";

interface Props {
  actions: TimeTravelActions;
}

export function LoadFullHistory({ actions }: Props) {
  return (
    <Button
      onClick={() => actions.load_full_history()}
      title={"Load the complete edit history for this file."}
    >
      <Icon name="file-archive" /> Load All
    </Button>
  );
}
