/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { redux } from "@cocalc/frontend/app-framework";
import { useEffect, useState } from "react";
import SideChat from "@cocalc/frontend/chat/side-chat";
import { EditorDescription } from "../frame-tree/types";
import { initChat } from "@cocalc/frontend/chat/register";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { hidden_meta_file } from "@cocalc/util/misc";
import { set } from "@cocalc/util/misc";
import type { ChatActions } from "@cocalc/frontend/chat/actions";

export function chatFile(path: string): string {
  return hidden_meta_file(path, "sage-chat");
}

interface Props {
  font_size: number;
}

function Chat({ font_size }: Props) {
  const { project_id, path: path0, actions } = useFrameContext();
  const path = chatFile(path0);
  const [initialized, setInitialized] = useState<boolean>(false);
  useEffect(() => {
    (async () => {
      // properly set the side chat compute server, if necessary
      await redux
        .getProjectActions(project_id)
        .setSideChatComputeServerId(path0);
      initChat(project_id, path);
      setInitialized(true);
    })();
  }, []);

  useEffect(() => {
    actions?.setState({ font_size } as any);
  }, [font_size]);

  if (!initialized) {
    return null;
  }
  return <SideChat project_id={project_id} path={path} />;
}

export const chat = {
  short: "Chat",
  name: "Chat",
  icon: "comment",
  commands: set([
    "decrease_font_size",
    "increase_font_size",
    "undo",
    "redo",
    "-page",
    "-actions",
  ]),
  component: Chat,
} as EditorDescription;

// TODO: this is an ugly special case for now to make the title bar buttons work.
export function undo(project_id, path0) {
  const path = hidden_meta_file(path0, "sage-chat");
  (redux.getEditorActions(project_id, path) as ChatActions)?.undo();
}
export function redo(project_id, path0) {
  const path = hidden_meta_file(path0, "sage-chat");
  (redux.getEditorActions(project_id, path) as ChatActions)?.redo();
}
