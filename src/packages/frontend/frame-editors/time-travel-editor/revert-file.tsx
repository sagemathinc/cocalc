/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { TimeTravelActions } from "./actions";
import { Icon } from "../../components";

interface Props {
  id: string;
  actions: TimeTravelActions;
  version: Date | undefined;
  doc;
}

export function RevertFile({ id, actions, version, doc }: Props) {
  return (
    <Button
      title={`Revert file to the displayed version (this makes a new version, so nothing is lost)`}
      onClick={() => {
        if (version != null) {
          actions.revert(id, version, doc);
        }
      }}
      disabled={version == null || actions.syncdoc?.is_read_only()}
    >
      <Icon name="undo" /> Revert
    </Button>
  );
}
