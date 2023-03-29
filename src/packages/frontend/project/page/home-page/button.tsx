/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Switch, Tooltip } from "antd";

import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

const WIDTH = "57px";

export default function HomePageButton({ project_id, active }) {
  const actions = useActions({ project_id });
  const hideActionButtons = useTypedRedux(project_id, "hideActionButtons");
  if (hideActionButtons)
    return (
      <div
        style={{
          width: WIDTH,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Tooltip title="Show the action bar" placement="right">
          <Switch
            onChange={() => {
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
        width: WIDTH,
        fontSize: "24px",
        color: active ? COLORS.ANTD_LINK_BLUE : COLORS.FILE_ICON,
      }}
      onClick={() => {
        actions?.set_active_tab("home");
      }}
    >
      <Icon name="home" style={{ verticalAlign: "5px" }} />
    </Button>
  );
}
