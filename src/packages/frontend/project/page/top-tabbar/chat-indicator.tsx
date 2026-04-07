/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { ReactNode } from "react";
import { UsersViewing } from "@cocalc/frontend/account/avatar/users-viewing";
import { ChatIndicator } from "@cocalc/frontend/chat/chat-indicator";
import { tab_to_path } from "@cocalc/util/misc";

interface Props {
  activeTab?: string;
  project_id: string;
  compact?: boolean;
}

export function ChatIndicatorTab({
  activeTab,
  project_id,
}: Props): ReactNode {
  if (!activeTab?.startsWith("editor-")) {
    return null;
  }
  const path = tab_to_path(activeTab);
  if (path == null) {
    return null;
  }
  return (
    <>
      <UsersViewing
        project_id={project_id}
        path={path}
        style={{ maxWidth: "120px" }}
      />
      <ChatIndicator
        project_id={project_id}
        path={path}
        chatState={"internal"}
      />
    </>
  );
}
