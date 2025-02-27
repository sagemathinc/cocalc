/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";

import {
  redux,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import {
  VBAR_KEY,
  getValidVBAROption,
} from "@cocalc/frontend/project/page/vbar";
import track from "@cocalc/frontend/user-tracking";
import { COLORS } from "@cocalc/util/theme";

export default function HomePageButton({ project_id, active, width }) {
  const actions = useActions({ project_id });
  const hideActionButtons = useTypedRedux(project_id, "hideActionButtons");
  if (hideActionButtons) return <></>;

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
        // Showing homepage in flyout only mode, otherwise the files as usual
        const account_store = redux.getStore("account") as any;
        const vbar = account_store?.getIn(["other_settings", VBAR_KEY]);
        const pureFlyoutMode = getValidVBAROption(vbar) === "flyout";
        actions?.set_active_tab(pureFlyoutMode ? "home" : "files");

        actions?.set_current_path("");
        actions?.setFlyoutExpanded("files", false, false);
        actions?.set_file_search("");

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
