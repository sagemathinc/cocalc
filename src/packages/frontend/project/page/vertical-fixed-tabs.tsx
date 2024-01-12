/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Vertical Fixed Tabs on the left in a project.
*/

import type { MenuProps } from "antd";
import { Button, Dropdown, Modal, Tooltip } from "antd";
import { throttle } from "lodash";
import { ReactNode, useLayoutEffect, useRef, useState } from "react";

import { CSS, useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import track from "@cocalc/frontend/user-tracking";
import { COLORS } from "@cocalc/util/theme";
import { useProjectContext } from "../context";
import { FIXED_PROJECT_TABS, FileTab, FixedTab } from "./file-tab";
import {
  VBAR_EXPLANATION,
  VBAR_KEY,
  VBAR_OPTIONS,
  getValidVBAROption,
} from "./vbar";

export const FIXED_TABS_BG_COLOR = "rgba(0, 0, 0, 0.02)";

export function VerticalFixedTabs() {
  const {
    project_id,
    active_project_tab: activeTab,
    actions,
  } = useProjectContext();
  const account_settings = useActions("account");
  const active_flyout = useTypedRedux({ project_id }, "flyout");
  const other_settings = useTypedRedux("account", "other_settings");
  const vbar = getValidVBAROption(other_settings.get(VBAR_KEY));
  const isAnonymous = useTypedRedux("account", "is_anonymous");
  const parent = useRef<HTMLDivElement>(null);
  const gap = useRef<HTMLDivElement>(null);
  const breakPoint = useRef<number>(0);
  const refCondensed = useRef<boolean>(false);
  const [condensed, setCondensed] = useState(false);

  const calcCondensed = throttle(
    () => {
      if (gap.current == null) return;
      if (parent.current == null) return;

      const gh = gap.current.clientHeight;
      const ph = parent.current.clientHeight;

      if (refCondensed.current) {
        // 5px slack to avoid flickering
        if (gh > 0 && ph > breakPoint.current + 5) {
          setCondensed(false);
          refCondensed.current = false;
        }
      } else {
        if (gh < 1) {
          setCondensed(true);
          refCondensed.current = true;
          // max? because when we start with a thin window, the ph is already smaller than th
          breakPoint.current = ph;
        }
      }
    },
    50,
    { trailing: true, leading: false },
  );

  // layout effect, because it measures sizes before rendering
  useLayoutEffect(() => {
    calcCondensed();
    window.addEventListener("resize", calcCondensed);
    return () => {
      window.removeEventListener("resize", calcCondensed);
    };
  }, []);

  const items: ReactNode[] = [];
  for (const nameStr in FIXED_PROJECT_TABS) {
    const name: FixedTab = nameStr as FixedTab; // helping TS a little bit
    const v = FIXED_PROJECT_TABS[name];
    if (isAnonymous && v.noAnonymous) {
      continue;
    }
    const color =
      activeTab == name
        ? { color: COLORS.PROJECT.FIXED_LEFT_ACTIVE }
        : undefined;

    const isActive = (vbar === "flyout" ? active_flyout : activeTab) === name;

    const style: CSS = {
      padding: "0",
      ...color,
      borderLeft: `4px solid ${
        isActive ? COLORS.PROJECT.FIXED_LEFT_ACTIVE : "transparent"
      }`,
      // highlight active flyout in flyout-only mode more -- see https://github.com/sagemathinc/cocalc/issues/6855
      ...(isActive && vbar === "flyout"
        ? { backgroundColor: COLORS.BLUE_LLLL }
        : undefined),
    };

    const tab = (
      <FileTab
        style={style}
        placement={"right"}
        key={name}
        project_id={project_id}
        name={name as FixedTab}
        label={condensed ? "" : undefined}
        isFixedTab={true}
        iconStyle={{
          fontSize: "24px",
          margin: "0",
          padding: "5px 0px",
          ...color,
        }}
        flyout={name}
      />
    );
    if (tab != null) items.push(tab);
  }

  function renderLayoutSelector() {
    const title = "Vertical bar layout";

    const items: NonNullable<MenuProps["items"]> = Object.entries(
      VBAR_OPTIONS,
    ).map(([key, label]) => ({
      key,
      onClick: () => {
        account_settings.set_other_settings(VBAR_KEY, key);
        track("flyout", {
          aspect: "layout",
          value: key,
          how: "button",
          project_id,
        });
      },
      label: (
        <>
          <Icon
            name="check"
            style={key === vbar ? undefined : { visibility: "hidden" }}
          />{" "}
          {label}
        </>
      ),
    }));

    items.unshift({ key: "delim-top", type: "divider" });
    items.unshift({
      key: "title",
      label: (
        <>
          <Icon name="layout" /> {title}{" "}
        </>
      ),
    });

    items.push({ key: "delimiter", type: "divider" });
    items.push({
      key: "info",
      label: (
        <>
          <Icon name="question-circle" /> More info
        </>
      ),
      onClick: () => {
        Modal.info({
          title: title,
          content: VBAR_EXPLANATION,
        });
      },
    });

    return (
      <div style={{ textAlign: "center" }}>
        <Dropdown menu={{ items }} trigger={["click"]} placement="topLeft">
          <Button icon={<Icon name="layout" />} block type="text" />
        </Dropdown>
      </div>
    );
  }

  function renderToggleSidebar() {
    return (
      <Tooltip title="Hide the action bar" placement="right">
        <Button
          size="small"
          type="text"
          block
          onClick={() => {
            track("action-bar", { action: "hide" });
            actions?.toggleActionButtons();
          }}
        >
          <Icon name="vertical-right-outlined" />
        </Button>
      </Tooltip>
    );
  }

  return (
    <div
      ref={parent}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        // this gives users on small screens a chance  to get to the bottom of the tabs.
        // also, the scrollbar is intentionally only active in condensed mode, to avoid it to show up briefly.
        overflowY: condensed ? "auto" : "hidden",
        overflowX: "hidden",
        flex: "1 1 0",
      }}
    >
      {items}
      {/* moves the layout selector to the bottom */}
      <div ref={gap} style={{ flex: 1 }}></div>
      {renderLayoutSelector()}
      {renderToggleSidebar()}
    </div>
  );
}
