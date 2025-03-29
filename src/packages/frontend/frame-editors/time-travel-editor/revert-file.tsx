/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import { TimeTravelActions } from "./actions";
import { Icon } from "../../components";

interface Props {
  id: string;
  actions: TimeTravelActions;
  version: number | undefined;
  doc;
  changesMode?: boolean;
}

export function RevertFile({ id, actions, version, doc, changesMode }: Props) {
  return (
    <Tooltip
      title={`Revert file to the displayed version (this makes a new version, so nothing is lost). ${
        changesMode ? "In changes mode, this uses newer version." : ""
      }`}
    >
      {" "}
      <Button
        onClick={() => {
          if (version != null) {
            actions.revert(id, version, doc);
          }
        }}
        disabled={version == null || actions.syncdoc?.is_read_only()}
      >
        <Icon name="undo" /> Revert
      </Button>
    </Tooltip>
  );
}
