/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { debounce } from "lodash";
import { filename_extension } from "@cocalc/util/misc";
import { useMemo } from "react";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { COLORS } from "@cocalc/util/theme";
import { Icon, Tip, Space } from "@cocalc/frontend/components";
import { UsersViewing } from "@cocalc/frontend/account/avatar/users-viewing";
import VideoChatButton from "./video/launch-button";
import { HiddenXSSM } from "@cocalc/frontend/components";
import { hidden_meta_file } from "@cocalc/util/misc";
import type { ChatActions } from "./actions";

export type ChatState =
  | "" // not opened (also undefined counts as not open)
  | "internal" // chat is open and managed internally (via frame tree)
  | "external" // chat is open and managed externally (e.g., legacy sage worksheet)
  | "pending"; // chat should be opened when the file itself is actually initialized.

const CHAT_INDICATOR_STYLE: React.CSSProperties = {
  fontSize: "14pt",
  borderRadius: "3px",
  paddingTop: "5px",
  cursor: "pointer",
};

const USERS_VIEWING_STYLE: React.CSSProperties = {
  maxWidth: "120px",
};

const CHAT_INDICATOR_TIP = (
  <span>
    Hide or show the chat for this file.
    <hr />
    Use HTML, Markdown, and LaTeX in your chats, and press shift+enter to send
    them. Your collaborators will be notified. Use @mention to notify them via
    email.
  </span>
);

interface Props {
  project_id: string;
  path: string;
  chatState?: ChatState;
}

export function ChatIndicator({ project_id, path, chatState }: Props) {
  const fullscreen = useTypedRedux("page", "fullscreen");

  const style: React.CSSProperties = {
    ...CHAT_INDICATOR_STYLE,
    ...{ display: "flex" },
    ...(fullscreen
      ? { top: "1px", right: "23px" }
      : { top: "-30px", right: "3px" }),
  };
  return (
    <div style={style}>
      <UsersViewing
        project_id={project_id}
        path={path}
        style={USERS_VIEWING_STYLE}
      />
      <ChatButton project_id={project_id} path={path} chatState={chatState} />
    </div>
  );
}

function ChatButton({ project_id, path, chatState }) {
  const toggleChat = debounce(
    () => {
      const actions = redux.getProjectActions(project_id);
      if (chatState) {
        actions.close_chat({ path });
      } else {
        actions.open_chat({ path });
      }
    },
    1000,
    { leading: true }
  );
  const fileUse = useTypedRedux("file_use", "file_use");
  const isNewChat = useMemo(
    () =>
      !!redux.getStore("file_use")?.get_file_info(project_id, path)
        ?.is_unseenchat,
    [fileUse, project_id, path]
  );

  if (filename_extension(path) === "sage-chat") {
    // Special case: do not show side chat for chatrooms
    return null;
  }

  return (
    <div
      style={{ color: isNewChat ? COLORS.FG_RED : COLORS.TAB }}
      className={isNewChat ? "smc-chat-notification" : undefined}
    >
      {chatState && (
        <span
          style={{ marginLeft: "5px", marginRight: "5px", color: "#428bca" }}
        >
          <VideoChatButton
            project_id={project_id}
            path={path}
            button={false}
            sendChat={(value) => {
              const actions = redux.getEditorActions(
                project_id,
                hidden_meta_file(path, "sage-chat")
              ) as ChatActions;
              actions.send_chat(value);
            }}
          />
        </span>
      )}
      <Tip
        title={
          <span>
            <Icon name="comment" />
            <Space /> <Space /> {chatState ? "Hide" : "Show"} chat
          </span>
        }
        tip={CHAT_INDICATOR_TIP}
        placement={"leftTop"}
        delayShow={3000}
        stable={false}
      >
        <span onClick={toggleChat}>
          <Icon
            name={chatState ? "caret-down" : "caret-left"}
            style={{ color: COLORS.FILE_ICON }}
          />
          <Space />
          <Icon name="comment" style={{ color: COLORS.FILE_ICON }} />
          <HiddenXSSM style={{ fontSize: "10.5pt", marginLeft: "5px" }}>
            Chat
          </HiddenXSSM>
        </span>
      </Tip>
    </div>
  );
}
