/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { UsersViewing } from "@cocalc/frontend/account/avatar/users-viewing";
import { tab_to_path } from "@cocalc/util/misc";
import { ChatButton } from "../chat-button";

export function ChatIndicatorTab({
  activeTab,
  project_id,
  compact,
}): JSX.Element | null {
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
  return (
    <>
      <UsersViewing
        project_id={project_id}
        path={path}
        style={{ maxWidth: "120px" }}
      />
      <ChatButton
        project_id={project_id}
        path={path}
        compact={compact}
        chatState={"internal"}
      />
    </>
  );
}
