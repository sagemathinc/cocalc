/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Tabs in a particular project.
*/

import type { MenuProps } from "antd";
import { Button, Dropdown, Modal, Tooltip } from "antd";
import { debounce, throttle } from "lodash";
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";

import { CSS, useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import useAppContext from "@cocalc/frontend/app/use-context";
import { ChatIndicator } from "@cocalc/frontend/chat/chat-indicator";
import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { useProjectContext } from "@cocalc/frontend/project/context";
import track from "@cocalc/frontend/user-tracking";
import { tab_to_path } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { FIXED_PROJECT_TABS, FileTab, FixedTab } from "./file-tab";
import FileTabs from "./file-tabs";
import { ShareIndicator } from "./share-indicator";
import { getValidVBAROption } from "./vbar";
import {
  VBAR_EXPLANATION,
  VBAR_KEY,
  VBAR_LABELS,
  VBAR_OPTIONS,
  VBAR_TOGGLE_LABELS,
} from "./vbar-consts";

const INDICATOR_STYLE: React.CSSProperties = {
  overflow: "hidden",
  paddingLeft: "5px",
} as const;

export const FIXED_TABS_BG_COLOR = "rgba(0, 0, 0, 0.02)";

interface PTProps {
  project_id: string;
}

export default function ProjectTabs(props: PTProps) {
  const { project_id } = props;
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");

  if (openFiles.size == 0) return <></>;

  return (
    <div
      className="smc-file-tabs"
      style={{
        width: "100%",
        height: "40px",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex" }}>
        <div
          style={{
            display: "flex",
            overflow: "hidden",
            flex: 1,
          }}
        >
          <FileTabs
            openFiles={openFiles}
            project_id={project_id}
            activeTab={activeTab}
          />
        </div>
        <div
          style={{
            display: "inline-flex",
            marginLeft: "-10px",
          }}
        >
          <ShareIndicatorTab activeTab={activeTab} project_id={project_id} />
          <ChatIndicatorTab activeTab={activeTab} project_id={project_id} />
        </div>
      </div>
    </div>
  );
}

interface FVTProps {
  setHomePageButtonWidth: (width: number) => void;
}

export function VerticalFixedTabs(props: Readonly<FVTProps>) {
  const intl = useIntl();
  const { setHomePageButtonWidth } = props;
  const {
    actions,
    project_id,
    active_project_tab: activeTab,
  } = useProjectContext();
  const { showVbarLabels } = useAppContext();
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

  useEffect(() => {
    if (parent.current == null) return;

    const observer = new ResizeObserver(
      debounce(
        () => {
          const width = parent.current?.offsetWidth;
          // we ignore zero width, which happens when not visible
          if (width == null || width == 0) return;
          setHomePageButtonWidth(width);
        },
        50,
        { trailing: true, leading: false },
      ),
    );
    observer.observe(parent.current);

    return () => {
      observer.disconnect();
    };
  }, [condensed, parent.current]);

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
      ...color,
      margin: "0",
      borderLeft: `4px solid ${
        isActive ? COLORS.PROJECT.FIXED_LEFT_ACTIVE : "transparent"
      }`,
      // highlight active flyout in flyout-only mode more -- see https://github.com/sagemathinc/cocalc/issues/6855
      ...(isActive && vbar === "flyout"
        ? { backgroundColor: COLORS.BLUE_LLLL }
        : undefined),
    };

    const spacing: string = showVbarLabels
      ? "5px"
      : condensed
      ? "8px" // margin for condensed mode
      : "12px"; // margin for normal mode

    const tab = (
      <FileTab
        style={style}
        placement={"right"}
        key={name}
        project_id={project_id}
        name={name as FixedTab}
        isFixedTab={true}
        iconStyle={{
          fontSize: condensed ? "18px" : "24px",
          margin: "0",
          ...color,
        }}
        extraSpacing={spacing}
        flyout={name}
        condensed={condensed}
        showLabel={showVbarLabels}
      />
    );
    if (tab != null) items.push(tab);
  }

  function renderToggleSidebar() {
    return (
      <Tooltip
        title={intl.formatMessage({
          id: "project.page.vertical-fixed-tabs.toggle-sidebar.tooltip",
          defaultMessage: "Hide the action bar",
          description: "This hides the vertical action bar in the UI",
        })}
        placement="rightTop"
      >
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
      <div ref={gap} style={{ flex: 1 }}></div>{" "}
      {/* moves hide switch to the bottom */}
      <LayoutSelector vbar={vbar} />
      {renderToggleSidebar()}
    </div>
  );
}

function LayoutSelector({ vbar }) {
  const intl = useIntl();
  const { showVbarLabels } = useAppContext();
  const { project_id } = useProjectContext();
  const account_settings = useActions("account");

  const title = intl.formatMessage({
    id: "project.page.vertical-fixed-tabs.title",
    defaultMessage: "Vertical bar layout",
  });

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
      <span>
        <Icon
          name="check"
          style={key === vbar ? undefined : { visibility: "hidden" }}
        />{" "}
        {intl.formatMessage(label)}
      </span>
    ),
  }));

  items.unshift({ key: "delim-top", type: "divider" });
  items.unshift({
    key: "title",
    label: (
      <span>
        <Icon name="layout" /> {title}{" "}
      </span>
    ),
  });

  items.push({ key: "delimiter1", type: "divider" });
  items.push({
    key: "toggle-labels",
    label: (
      <span>
        <Icon name={"signature-outlined"} />{" "}
        {intl.formatMessage(VBAR_TOGGLE_LABELS, { show: showVbarLabels })}
      </span>
    ),
    onClick: () => {
      account_settings.set_other_settings(VBAR_LABELS, !showVbarLabels);
    },
  });

  items.push({ key: "delimiter2", type: "divider" });
  items.push({
    key: "info",
    label: (
      <span>
        <Icon name="question-circle" /> {intl.formatMessage(labels.more_info)}
      </span>
    ),
    onClick: () => {
      Modal.info({
        title,
        content: intl.formatMessage(VBAR_EXPLANATION),
      });
    },
  });

  return (
    <div style={{ textAlign: "center" }}>
      <Dropdown menu={{ items }} trigger={["click"]} placement="topLeft">
        <Button
          icon={<Icon name="layout" />}
          style={{ margin: "5px" }}
          type="text"
        />
      </Dropdown>
    </div>
  );
}

function ChatIndicatorTab({ activeTab, project_id }): React.JSX.Element | null {
  const openFileInfo = useTypedRedux({ project_id }, "open_files");
  if (!activeTab?.startsWith("editor-")) {
    // TODO: This is the place in the code where we could support project-wide
    // side chat, or side chats for each individual Files/Search, etc. page.
    return null;
  }
  const path = tab_to_path(activeTab);
  if (path == null) {
    // bug -- tab is not a file tab.
    return null;
  }
  const chatState = openFileInfo.getIn([path, "chatState"]) as any;
  return (
    <div style={INDICATOR_STYLE}>
      <ChatIndicator
        project_id={project_id}
        path={path}
        chatState={chatState}
      />
    </div>
  );
}

function ShareIndicatorTab({ activeTab, project_id }) {
  const isAnonymous = useTypedRedux("account", "is_anonymous");
  const currentPath = useTypedRedux({ project_id }, "current_path");

  if (isAnonymous) {
    // anon users can't share anything
    return null;
  }
  const path = activeTab === "files" ? currentPath : tab_to_path(activeTab);
  if (path == null) {
    // nothing specifically to share
    return null;
  }
  if (path === "") {
    // sharing whole project not implemented
    return null;
  }
  return (
    <div style={INDICATOR_STYLE}>
      <ShareIndicator project_id={project_id} path={path} />
    </div>
  );
}
