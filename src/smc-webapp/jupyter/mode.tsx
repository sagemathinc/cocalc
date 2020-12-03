/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// A little mode indicator, next to the Kernel's usage information

import { React, useRedux } from "../app-framework";
import { COLORS } from "smc-util/theme";
import { Icon } from "../r_misc";

interface ModeProps {
  name: string;
}

export const Mode: React.FC<ModeProps> = React.memo((props: ModeProps) => {
  const { name } = props;
  const mode = useRedux([name, "mode"]);

  if (mode !== "edit") {
    return <span />;
  } else {
    return (
      <div
        className="pull-right"
        style={{ color: COLORS.GRAY, margin: "5px", paddingRight: "5px" }}
      >
        <Icon name="pencil" />
      </div>
    );
  }
});
