/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Checkbox, Tooltip } from "antd";
import { TimeTravelActions } from "./actions";

interface Props {
  id: string;
  actions: TimeTravelActions;
  disabled: boolean;
  changes_mode: boolean; // whether or not in changes mode.
}

export function ChangesMode(props: Props) {
  const toggle = () => {
    props.actions.setChangesMode(props.id, !props.changes_mode);
  };

  return (
    <Tooltip
      placement="top"
      title="Toggle whether or not to show the changes from one point in time to another"
      mouseEnterDelay={1}
    >
      <Checkbox
        disabled={props.disabled}
        onChange={toggle}
        checked={props.disabled ? false : props.changes_mode}
      >
        Changes
      </Checkbox>
    </Tooltip>
  );
}
