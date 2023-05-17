/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Switch, Tooltip } from "antd";

import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import track from "@cocalc/frontend/user-tracking";

export default function HomePageButton({ project_id, active, width }) {
  const actions = useActions({ project_id });
  const hideActionButtons = useTypedRedux(project_id, "hideActionButtons");
  if (hideActionButtons)
    return (
      <div
        style={{
          width,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Tooltip title="Show the action bar" placement="right">
          <Switch
            onChange={() => {
              track("action-bar", { action: "show" });
              actions?.toggleActionButtons();
            }}
          />
        </Tooltip>
      </div>
    );

  return (
    <Button
      size="large"
      type="text"
      style={{
        width,
        border: "none",
        borderRadius: "0",
        fontSize: "24px",
        color: active ? COLORS.ANTD_LINK_BLUE : COLORS.FILE_ICON,
      }}
      onClick={() => {
        actions?.set_active_tab("home");
        track("switch_to_fixed_tab", {
          how: "click-on-tab",
          name: "home",
          project_id,
        });
      }}
    >
      <Icon name="home" style={{ verticalAlign: "5px" }} />
    </Button>
  );
}
