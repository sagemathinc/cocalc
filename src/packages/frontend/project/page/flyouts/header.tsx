/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Tooltip } from "antd";

import { useActions } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { capitalize } from "@cocalc/util/misc";
import { PathNavigator } from "../../explorer/path-navigator";
import { FIXED_PROJECT_TABS, FixedTab } from "../file-tab";
import { FIX_BORDER } from "../page";
import { FIXED_TABS_BG_COLOR } from "../tabs";
import { LogHeader } from "./log";

export function FlyoutHeader({
  flyout,
  flyoutWidth,
  project_id,
  narrowerPX = 0,
}: {
  project_id: string;
  flyoutWidth: number;
  flyout: FixedTab;
  narrowerPX: number;
}) {
  const actions = useActions({ project_id });

  function renderDefaultTitle() {
    const title = FIXED_PROJECT_TABS[flyout].flyoutTitle;
    if (title != null) {
      return title;
    } else {
      return capitalize(flyout);
    }
  }

  function renderIcon() {
    const iconName = FIXED_PROJECT_TABS[flyout].icon;
    if (iconName != null) {
      return <Icon name={iconName} />;
    } else {
      return null;
    }
  }

  function closeBtn() {
    return (
      <Tooltip title="Hide this action panel" placement="bottom">
        <Icon
          name="vertical-right-outlined"
          className="cc-project-fixedtab-close"
          style={{
            flex: "0",
            float: "right",
            padding: "5px",
            borderRadius: "2px",
            margin: "0",
          }}
          onClick={() => actions?.toggleFlyout(flyout)}
        />
      </Tooltip>
    );
  }

  function renderTitle() {
    switch (flyout) {
      case "files":
        return (
          <PathNavigator
            style={{ flex: 1 }}
            mode={"flyout"}
            project_id={project_id}
            className={"cc-project-flyout-path-navigator"}
          />
        );
      case "log":
        return <LogHeader project_id= {project_id} />
      default:
        return (
          <div style={{ flex: 1 }}>
            {renderIcon()} {renderDefaultTitle()}
          </div>
        );
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        borderRight: FIX_BORDER,
        borderTop: FIX_BORDER,
        borderLeft: FIX_BORDER,
        background: FIXED_TABS_BG_COLOR,
        borderRadius: "5px 5px 0 0",
        width: `${flyoutWidth - narrowerPX}px`,
        paddingLeft: "10px",
        paddingTop: "10px",
        fontSize: "1.2em",
        marginRight: "5px",
      }}
    >
      {renderTitle()}
      {closeBtn()}
    </div>
  );
}
