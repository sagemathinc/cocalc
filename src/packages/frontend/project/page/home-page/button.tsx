/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";

import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
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
        // People find the entire home page idea very confusing.
        // Thus I've commented this out:

        // actions?.set_active_tab("home");

        // And replaced it by just showing the file explorer in the
        // home directory, with no flyout panels open, which is a reasonable
        // expectation for a "Home" button, since that's what the project shows
        // by default on open.  This is just a very quick bandaide to reduce
        // confusion until we come up with something better (e.g., a dropdown
        // menu and shortcut toolbar).
        actions?.set_active_tab("files");
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
