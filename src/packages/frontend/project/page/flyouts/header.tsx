/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Tooltip } from "antd";

import { Icon } from "@cocalc/frontend/components";
import { capitalize } from "@cocalc/util/misc";
import { useProjectContext } from "../../context";
import { PathNavigator } from "../../explorer/path-navigator";
import { FIX_BORDER } from "../common";
import { FIXED_PROJECT_TABS, FixedTab } from "../file-tab";
import { FIXED_TABS_BG_COLOR } from "../tabs";
import { FLYOUT_PADDING } from "./consts";
import { LogHeader } from "./log";

interface Props {
  flyoutWidth: number;
  flyout: FixedTab;
  narrowerPX: number;
}

export function FlyoutHeader(_: Readonly<Props>) {
  const { flyout, flyoutWidth, narrowerPX = 0 } = _;
  const { actions, project_id } = useProjectContext();

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
      <Tooltip title="Hide this panel" placement="bottom">
        <Icon
          name="times"
          className="cc-project-fixedtab-close"
          style={{
            marginRight: FLYOUT_PADDING,
            padding: FLYOUT_PADDING,
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
        return <LogHeader project_id={project_id} />;
      case "search":
        return (
          <div
            style={{
              flex: 1,
              display: "flex",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontWeight: "bold",
            }}
          >
            <Icon
              name="search"
              style={{ fontSize: "120%", marginRight: "10px" }}
            />{" "}
            <PathNavigator
              style={{ flex: "1 0 auto" }}
              mode={"flyout"}
              project_id={project_id}
              className={"cc-project-flyout-path-navigator"}
            />
          </div>
        );
      default:
        return (
          <div style={{ flex: 1, fontWeight: "bold" }}>
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
        alignItems: "start",
        borderRight: FIX_BORDER,
        borderTop: FIX_BORDER,
        borderLeft: FIX_BORDER,
        background: FIXED_TABS_BG_COLOR,
        borderRadius: "5px 5px 0 0",
        width: `${flyoutWidth - narrowerPX}px`,
        paddingLeft: "10px",
        paddingTop: "10px",
        fontSize: "1.2em",
        marginRight: FLYOUT_PADDING,
      }}
    >
      {renderTitle()}
      {closeBtn()}
    </div>
  );
}
