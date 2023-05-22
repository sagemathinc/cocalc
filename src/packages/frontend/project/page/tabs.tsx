/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Tabs in a particular project.
*/
import { Switch, Tooltip } from "antd";

import { throttle } from "lodash";
import { ReactNode, useLayoutEffect, useRef, useState } from "react";

import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { ChatIndicator } from "@cocalc/frontend/chat/chat-indicator";
import { tab_to_path } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { FileTab, FixedTab, FIXED_PROJECT_TABS } from "./file-tab";
import FileTabs from "./file-tabs";
import { ShareIndicator } from "./share-indicator";
import track from "@cocalc/frontend/user-tracking";

const INDICATOR_STYLE: React.CSSProperties = {
  overflow: "hidden",
  paddingLeft: "5px",
} as const;

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
        padding: "2.5px",
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
  project_id: string;
  activeTab: string;
}

export function VerticalFixedTabs(props: FVTProps) {
  const { project_id, activeTab } = props;
  const actions = useActions({ project_id });
  const isAnonymous = useTypedRedux("account", "is_anonymous");
  const parent = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const breakPoint = useRef<number>(0);
  const refCondensed = useRef<boolean>(false);
  const [condensed, setCondensed] = useState(false);

  const calcCondensed = throttle(
    () => {
      if (tabs.current == null) return;
      if (parent.current == null) return;

      const th = tabs.current.clientHeight;
      const ph = parent.current.clientHeight;

      if (refCondensed.current) {
        // 5px slack to avoid flickering
        if (ph > breakPoint.current + 5) {
          setCondensed(false);
          refCondensed.current = false;
        }
      } else {
        if (ph < th) {
          setCondensed(true);
          refCondensed.current = true;
          // max? because when we start with a thin window, the ph is already smaller than th
          breakPoint.current = Math.max(th, ph);
        }
      }
    },
    50,
    { trailing: true, leading: false }
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
  for (const name in FIXED_PROJECT_TABS) {
    const v = FIXED_PROJECT_TABS[name];
    if (isAnonymous && v.noAnonymous) {
      continue;
    }
    const color =
      activeTab == name
        ? { color: COLORS.PROJECT.FIXED_LEFT_ACTIVE }
        : undefined;

    // uncomment this to move the processes and settings to the bottom like in vscode.
    // some of us do NOT like that.
    // if (name == "info") {
    //   items.push(<div style={{ flex: 1 }}></div>);
    // }
    items.push(
      <FileTab
        style={{
          margin: "5px 0px",
          ...color,
          borderLeft: `4px solid ${
            activeTab == name ? COLORS.PROJECT.FIXED_LEFT_ACTIVE : "transparent"
          }`,
        }}
        placement={"right"}
        key={name}
        project_id={project_id}
        name={name as FixedTab}
        label={condensed ? "" : undefined}
        isFixedTab={true}
        iconStyle={{
          fontSize: "24px",
          margin: "0px 6px",
          ...color,
        }}
      />
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
      }}
    >
      <div
        ref={tabs}
        style={{ display: "flex", flexDirection: "column", flex: "1 1 0" }}
      >
        {items}
        <Tooltip title="Hide the action bar" placement="right">
          <Switch
            style={{ margin: "10px" }}
            size="small"
            checked
            onChange={() => {
              actions?.toggleActionButtons();
              track("action-bar", { action: "hide" });
            }}
          />
        </Tooltip>
      </div>
    </div>
  );
}

function ChatIndicatorTab({ activeTab, project_id }): JSX.Element | null {
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
