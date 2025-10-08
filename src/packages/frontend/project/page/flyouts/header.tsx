/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { TourName } from "@cocalc/frontend/account/tours";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { ComputeServerDocStatus } from "@cocalc/frontend/compute/doc-status";
import SelectComputeServerForFileExplorer from "@cocalc/frontend/compute/select-server-for-explorer";
import { isIntlMessage } from "@cocalc/frontend/i18n";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { PathNavigator } from "@cocalc/frontend/project/explorer/path-navigator";
import track from "@cocalc/frontend/user-tracking";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { FIX_BORDER } from "../common";
import { FIXED_PROJECT_TABS, FixedTab } from "../file-tab";
import { FIXED_TABS_BG_COLOR } from "../activity-bar-tabs";
import { ActiveHeader } from "./active-header";
import { FLYOUT_PADDING } from "./consts";
import { LogHeader } from "./log-header";
import DiskUsage from "@cocalc/frontend/project/disk-usage/disk-usage";

const FLYOUT_FULLPAGE_TOUR_NAME: TourName = "flyout-fullpage";

interface Props {
  flyoutWidth: number;
  flyout: FixedTab;
  narrowerPX: number;
}

export function FlyoutHeader(_: Readonly<Props>) {
  const { flyout, flyoutWidth, narrowerPX = 0 } = _;
  const intl = useIntl();
  const { actions, project_id, is_active } = useProjectContext();
  const compute_server_id = useTypedRedux({ project_id }, "compute_server_id");
  // the flyout fullpage button explanation isn't an Antd tour, but has the same effect.
  const tours = useTypedRedux("account", "tours");
  const [highlightFullpage, setHighlightFullpage] = useState<boolean>(false);

  useEffect(() => {
    // we only want to show the highlight if the project page is in the front (active)
    // and the user has not seen the tour yet.
    const show =
      is_active &&
      (tours == null || !tours.includes(FLYOUT_FULLPAGE_TOUR_NAME));
    setHighlightFullpage(show || false);
  }, [is_active]);

  function renderDefaultTitle() {
    const title =
      FIXED_PROJECT_TABS[flyout].flyoutTitle ??
      FIXED_PROJECT_TABS[flyout].label;
    if (title != null) {
      return isIntlMessage(title) ? intl.formatMessage(title) : title;
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
      <Tooltip
        title={intl.formatMessage({
          id: "flyouts.header.hide.tooltip",
          defaultMessage: "Hide this panel",
        })}
        placement="bottom"
      >
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

  function markFullpageTourDone() {
    if (!highlightFullpage) return;
    const actions = redux.getActions("account");
    actions.setTourDone(FLYOUT_FULLPAGE_TOUR_NAME);
    setHighlightFullpage(false);
  }

  function renderFullpagePopupTitle() {
    return (
      <>
        <div>
          <FormattedMessage
            id="flyouts.header.fullpage.tooltip.title"
            defaultMessage={"Open this flyout panel as a full page."}
          />
        </div>
        {highlightFullpage ? (
          <>
            <hr />
            <div>
              You can change the behavior of these buttons on the side, via the
              vertical menu layout button selector at the bottom left.
            </div>
            <div style={{ textAlign: "center", marginTop: "10px" }}>
              <Button onClick={markFullpageTourDone}>
                Don't show this again
              </Button>
            </div>
          </>
        ) : null}
      </>
    );
  }

  function fullPageBtn() {
    // active files has no fullpage equivalent – it's the tabs
    if (flyout === "active") return null;

    const style = {
      marginRight: FLYOUT_PADDING,
      padding: FLYOUT_PADDING,
      fontSize: "12px",
      ...(highlightFullpage
        ? { backgroundColor: COLORS.ANTD_ORANGE }
        : undefined),
    };

    return (
      <>
        <Tooltip title={renderFullpagePopupTitle()} placement="bottom">
          <Icon
            name="expand"
            className="cc-project-fixedtab-fullpage"
            style={style}
            onClick={() => {
              // flyouts and full pages share the same internal name
              actions?.set_active_tab(flyout);
              track("switch-to-fixed-tab", {
                project_id,
                flyout,
                how: "click-on-flyout-expand-button",
              });
              markFullpageTourDone();
              // now, close the flyout panel, to finish the transition
              actions?.toggleFlyout(flyout);
            }}
          />
        </Tooltip>
      </>
    );
  }

  function renderTitle() {
    switch (flyout) {
      case "files":
        return (
          <div style={{ width: "100%" }}>
            <div style={{ display: "flex" }}>
              <SelectComputeServerForFileExplorer
                size="small"
                project_id={project_id}
                key="compute-server"
                noLabel={true}
                style={{
                  borderRadius: "5px",
                  marginRight: "5px",
                }}
              />
              <PathNavigator
                style={{ flex: 1 }}
                mode={"flyout"}
                project_id={project_id}
                className={"cc-project-flyout-path-navigator"}
              />
              <DiskUsage
                project_id={project_id}
                style={{ marginTop: "-5px" }}
              />
            </div>
            {!!compute_server_id && (
              <div style={{ fontSize: "10pt" }}>
                <ComputeServerDocStatus
                  id={compute_server_id}
                  requestedId={compute_server_id}
                  project_id={project_id}
                  noSync
                />
              </div>
            )}
          </div>
        );
      case "log":
        return <LogHeader />;
      case "search":
        return <SearchHeader />;
      case "active":
        return <ActiveHeader />;
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
        height: "40px",
        overflow: "hidden",
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
      {fullPageBtn()}
      {closeBtn()}
    </div>
  );
}

function SearchHeader() {
  const { project_id } = useProjectContext();
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
      <Icon name="search" style={{ fontSize: "120%", marginRight: "10px" }} />{" "}
      <PathNavigator
        style={{ flex: "1 0 auto" }}
        mode={"flyout"}
        project_id={project_id}
        className={"cc-project-flyout-path-navigator"}
      />
    </div>
  );
}
