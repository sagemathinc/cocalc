/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useEffect, useState } from "react";
import { redux } from "@cocalc/frontend/app-framework";
import type { ChatActions } from "@cocalc/frontend/chat/actions";
import { initChat } from "@cocalc/frontend/chat/register";
import SideChat from "@cocalc/frontend/chat/side-chat";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { labels } from "@cocalc/frontend/i18n";
import { hidden_meta_file } from "@cocalc/util/misc";
import { EditorComponentProps, EditorDescription } from "../frame-tree/types";
import { chatroom } from "@cocalc/frontend/frame-editors/chat-editor/editor";

export function chatFile(path: string): string {
  return hidden_meta_file(path, "sage-chat");
}

function Chat({ font_size, desc }: EditorComponentProps) {
  const { project_id, path: path0, actions, id: frameId } = useFrameContext();
  const path = chatFile(path0);
  const [sideChatActions, setSideChatActions] = useState<ChatActions | null>(
    null,
  );
  useEffect(() => {
    (async () => {
      // properly set the side chat compute server, if necessary
      await redux
        .getProjectActions(project_id)
        .setSideChatComputeServerId(path0);
      const sideChatActions = initChat(project_id, path);
      sideChatActions.frameTreeActions = actions;
      sideChatActions.frameId = frameId;
      setSideChatActions(sideChatActions);
    })();
  }, []);

  if (sideChatActions == null) {
    return null;
  }
  return (
    <SideChat
      actions={sideChatActions}
      project_id={project_id}
      path={path}
      fontSize={font_size}
      desc={desc}
    />
  );
}

const commands: any = {};
for (const x in chatroom.commands) {
  if (x == "time_travel" || x == "show_search") {
    continue;
  }
  commands[x] = true;
}
export const chat: EditorDescription = {
  type: "chat",
  short: labels.chat,
  name: labels.chat,
  icon: "comment",
  commands,
  component: Chat,
} as const;

export function getSideChatActions({
  project_id,
  path,
}: {
  project_id: string;
  path: string;
}): ChatActions | null {
  const actions = redux.getEditorActions(project_id, chatFile(path));
  if (actions == null) {
    return null;
  }
  return actions as ChatActions;
}

// TODO: this is an ugly special case for now to make the title bar buttons work.
// TODO: but wait -- those buttons are gone now, so maybe this can be deleted?!
export function undo(project_id, path) {
  return getSideChatActions({ project_id, path })?.undo();
}
export function redo(project_id, path) {
  return getSideChatActions({ project_id, path })?.redo();
}
