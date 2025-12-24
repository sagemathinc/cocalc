/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import { TimeTravelActions } from "./actions";
import { Icon } from "../../components";
import type { Document } from "@cocalc/sync/editor/generic/types";

interface Props {
  actions: TimeTravelActions;
  version: number | string | undefined;
  doc: () => Document | undefined;
  changesMode?: boolean;
  gitMode?: boolean;
}

export function RevertFile({
  actions,
  version,
  doc,
  changesMode,
  gitMode,
}: Props) {
  return (
    <Tooltip
      title={`Revert file to the displayed version (this makes a new version, so nothing is lost). ${
        changesMode ? "In changes mode, this uses newer version." : ""
      }`}
    >
      <Button
        onClick={() => {
          if (version != null) {
            const v =
              typeof version === "string" ? version : `${version ?? ""}`;
            const d = doc();
            if (d != null) {
              actions.revert({ version: v, doc: d, gitMode });
            }
          }
        }}
        disabled={version == null || actions.syncdoc?.is_read_only()}
      >
        <Icon name="undo" /> Revert
      </Button>
    </Tooltip>
  );
}
