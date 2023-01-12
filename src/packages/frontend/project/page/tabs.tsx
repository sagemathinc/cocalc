/*
Tabs in a particular project.
*/

import { Tabs } from "antd";
import type { TabsProps } from "antd";
import { tab_to_path } from "@cocalc/util/misc";
import { ChatIndicator } from "@cocalc/frontend/chat/chat-indicator";
import { ShareIndicator } from "./share-indicator";
import { FIXED_PROJECT_TABS, FileTab, FixedTab } from "./file-tab";
import FileTabs from "./file-tabs";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

const INDICATOR_STYLE: React.CSSProperties = {
  overflow: "hidden",
  paddingLeft: "5px",
} as const;

export default function ProjectTabs({ project_id }) {
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");
  const fullscreen = useTypedRedux("page", "fullscreen");

  const width = $(window).width() ?? 1000; // default 1000 is to make TS happy
  const shrinkFixedTabs = width < 376 + openFiles.size * 250;

  return (
    <div
      className="smc-file-tabs"
      style={{
        width: "100%",
        height: "40px",
        padding: "5px",
      }}
    >
      <div style={{ display: "flex" }}>
        {fullscreen != "kiosk" && (
          <FixedTabs
            shrinkFixedTabs={shrinkFixedTabs}
            project_id={project_id}
            activeTab={activeTab}
          />
        )}
        <div
          style={{
            display: "flex",
            overflow: "hidden",
            flex: 1,
            marginLeft: "5px",
            borderLeft: "1px solid #ddd",
            paddingLeft: "5px",
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
            borderLeft: "1px solid lightgrey",
            display: "inline-flex",
          }}
        >
          <ChatIndicatorTab
            shrinkFixedTabs={shrinkFixedTabs}
            activeTab={activeTab}
            project_id={project_id}
          />
          <ShareIndicatorTab
            shrinkFixedTabs={shrinkFixedTabs}
            activeTab={activeTab}
            project_id={project_id}
          />
        </div>
      </div>
    </div>
  );
}

function FixedTabs({ shrinkFixedTabs, project_id, activeTab }) {
  const isAnonymous = useTypedRedux("account", "is_anonymous");
  const items: TabsProps["items"] = [];
  for (const name in FIXED_PROJECT_TABS) {
    const v = FIXED_PROJECT_TABS[name];
    if (isAnonymous && v.noAnonymous) {
      continue;
    }
    items.push({
      key: name,
      label: (
        <FileTab
          style={{ margin: shrinkFixedTabs ? "0 -10px 0 -5px" : "0 -10px" }}
          key={name}
          project_id={project_id}
          name={name as FixedTab}
          label={shrinkFixedTabs ? "" : undefined}
        />
      ),
    });
  }
  return <Tabs size="small" items={items} type="card" activeKey={activeTab} />;
}

function ChatIndicatorTab({
  shrinkFixedTabs,
  activeTab,
  project_id,
}): JSX.Element | null {
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
        shrink_fixed_tabs={shrinkFixedTabs}
      />
    </div>
  );
}

function ShareIndicatorTab({ shrinkFixedTabs, activeTab, project_id }) {
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
      <ShareIndicator
        project_id={project_id}
        path={path}
        shrink_fixed_tabs={shrinkFixedTabs}
      />
    </div>
  );
}
