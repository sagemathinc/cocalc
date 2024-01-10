/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "antd";

import { useActions } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import track from "@cocalc/frontend/user-tracking";
import { COLORS } from "@cocalc/util/theme";

export default function HomePageButton({ project_id, active, width }) {
  const actions = useActions({ project_id });

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
        transitionDuration: "0s",
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
