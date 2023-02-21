/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// A little mode indicator, next to the Kernel's usage information

import { React } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { NotebookMode } from "./types";

interface ModeProps {
  mode: NotebookMode;
}

export const Mode: React.FC<ModeProps> = React.memo((props: ModeProps) => {
  const { mode } = props;

  if (mode !== "edit") {
    return <span />;
  } else {
    return (
      <div
        className="pull-right"
        style={{
          color: COLORS.GRAY,
          margin: "0px",
          paddingRight: "5px",
          borderRight: "1px solid gray",
          marginRight: "5px",
        }}
      >
        <Icon name="pencil" />
      </div>
    );
  }
});
