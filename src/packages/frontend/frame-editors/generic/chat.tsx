/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useActions } from "@cocalc/frontend/app-framework";
import { useEffect } from "react";
import SideChat from "@cocalc/frontend/chat/side-chat";
import { EditorDescription } from "../frame-tree/types";
import { init as initChat } from "@cocalc/frontend/chat/register";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { hidden_meta_file } from "@cocalc/util/misc";
import { set } from "@cocalc/util/misc";

interface Props {
  font_size: number;
}

function Chat({ font_size }: Props) {
  const { project_id, path: path0 } = useFrameContext();
  const path = hidden_meta_file(path0, "sage-chat");
  initChat(project_id, path);
  const actions = useActions(project_id, path);
  useEffect(() => {
    actions.setState({ font_size });
  }, [font_size]);

  return <SideChat project_id={project_id} path={path} />;
}

export const chat = {
  short: "Chat",
  name: "Chat",
  icon: "comment",
  buttons: set([
    "decrease_font_size",
    "increase_font_size",
    "-page",
    "-actions",
  ]),
  component: Chat,
} as EditorDescription;
