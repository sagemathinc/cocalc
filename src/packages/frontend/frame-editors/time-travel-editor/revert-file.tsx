/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { TimeTravelActions } from "./actions";
import { Icon } from "../../components";

interface Props {
  actions: TimeTravelActions;
  version: Date | undefined;
}

export function RevertFile(props: Props) {
  return (
    <Button
      title={`Revert file to the displayed version (this makes a new version, so nothing is lost)`}
      onClick={() => {
        if (props.version != null) {
          props.actions.revert(props.version);
        }
      }}
      disabled={props.version == null || props.actions.syncdoc?.is_read_only()}
    >
      <Icon name="undo" /> Revert
    </Button>
  );
}
