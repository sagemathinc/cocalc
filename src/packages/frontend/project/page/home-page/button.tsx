/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "antd";

import { useActions } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

export default function HomePageButton({ project_id, active }) {
  const actions = useActions({ project_id });
  return (
    <Button
      size="large"
      type="text"
      style={{
        width: "57px",
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
