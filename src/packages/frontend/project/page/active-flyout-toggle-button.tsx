/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";

import { CSS, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { COLORS } from "@cocalc/util/theme";

export function ActiveFlyoutToggleButton() {
  const { project_id, actions } = useProjectContext();
  const isActive = useTypedRedux({ project_id }, "flyout_active");
  const style: CSS = isActive
    ? { } // padding: "5px 15px 10px 15px", height: "23px" }
    : {};

  return (
    <Tooltip title={`${isActive ? "Hide" : "Show"} the active files panel`}>
      <Button
        type="text"
        style={style}
        onClick={() => {
          actions?.toggleFlyout("active");
        }}
      >
        <Icon
          style={{ color: isActive ? COLORS.FILE_ICON : COLORS.ANTD_LINK_BLUE }}
          name={"database"}
          rotate={isActive ? "270" : undefined}
        />
      </Button>
    </Tooltip>
  );
}
