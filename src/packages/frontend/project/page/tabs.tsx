/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Tabs in a particular project.
*/

import { ReactNode } from "react";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { ChatIndicator } from "@cocalc/frontend/chat/chat-indicator";
import { tab_to_path } from "@cocalc/util/misc";
import { FileTab, FixedTab, FIXED_PROJECT_TABS } from "./file-tab";
import FileTabs from "./file-tabs";
import { ShareIndicator } from "./share-indicator";

const INDICATOR_STYLE: React.CSSProperties = {
  overflow: "hidden",
  paddingLeft: "5px",
} as const;

export default function ProjectTabs({ project_id }) {
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

export function VerticalFixedTabs({ project_id, activeTab }) {
  const isAnonymous = useTypedRedux("account", "is_anonymous");
  const items: ReactNode[] = [];
  // <div style={{ textAlign: "center", color: "#666" }}>Project</div>,
  for (const name in FIXED_PROJECT_TABS) {
    const v = FIXED_PROJECT_TABS[name];
    if (isAnonymous && v.noAnonymous) {
      continue;
    }
    const color = activeTab == name ? { color: "#1677ff" } : undefined;

    // uncomment this to move the processes and settings to the bottom like in vscode.
    // some of us do NOT like that.
    //     if (name == "info") {
    //       items.push(<div style={{ flex: 1 }}></div>);
    //     }
    items.push(
      <FileTab
        style={{
          margin: "5px 0px",
          ...color,
          borderLeft: `4px solid ${
            activeTab == name ? "#1677ff" : "transparent"
          }`,
        }}
        placement={"right"}
        key={name}
        project_id={project_id}
        name={name as FixedTab}
        iconStyle={{
          fontSize: "24px",
          margin: "0px 3px",
          ...color,
        }}
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {items}
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
  const isChatOpen = openFileInfo.getIn([path, "is_chat_open"]);
  return (
    <div style={INDICATOR_STYLE}>
      <ChatIndicator
        project_id={project_id}
        path={path}
        is_chat_open={isChatOpen}
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
