/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { debounce } from "lodash";
import { filename_extension } from "smc-util/misc2";
import { analytics_event } from "../tracker";
import { React, redux, COLOR, useRedux, useMemo } from "../app-framework";
import { Icon, Tip, Space } from "../r_misc";
import { UsersViewing } from "../account/avatar/users-viewing";
//import { VideoChatButton } from "../video-chat";
const { VideoChatButton } = require("../video-chat");

const CHAT_INDICATOR_STYLE: React.CSSProperties = {
  fontSize: "14pt",
  borderRadius: "3px",
  marginTop: "3px",
};

const USERS_VIEWING_STYLE: React.CSSProperties = {
  maxWidth: "120px",
  paddingTop: "3px",
};

const CHAT_INDICATOR_TIP = (
  <span>
    Hide or show the chat for this file.
    <hr />
    Use HTML, Markdown, and LaTeX in your chats, and press shift+enter to send
    them. Your collaborators will be notified.
  </span>
);

interface Props {
  project_id: string;
  path: string;
  is_chat_open?: boolean;
  shrink_fixed_tabs?: boolean;
}

export const ChatIndicator: React.FC<Props> = ({
  project_id,
  path,
  is_chat_open,
  shrink_fixed_tabs,
}) => {
  const fullscreen = useRedux(["page", "fullscreen"]);
  const file_use = useRedux(["file_use", "file_use"]);
  const is_new_chat = useMemo(
    () =>
      !!redux.getStore("file_use")?.get_file_info(project_id, path)
        ?.is_unseenchat,
    [file_use]
  );

  const toggle_chat = debounce(
    () => {
      const a = redux.getProjectActions(project_id);
      if (is_chat_open) {
        a.close_chat({ path });
        analytics_event("side_chat", "close");
      } else {
        a.open_chat({ path });
        analytics_event("side_chat", "open");
      }
    },
    1000,
    { leading: true }
  );

  function render_chat_button() {
    if (filename_extension(path) === "sage-chat") {
      // Special case: do not show side chat for chatrooms
      return;
    }

    const color = is_new_chat ? COLOR.FG_RED : COLOR.FG_BLUE;
    const action = is_chat_open ? "Hide" : "Show";
    const title = (
      <span>
        <Icon name="comment" />
        <Space /> <Space /> {action} chat
      </span>
    );
    return (
      <div
        style={{
          cursor: "pointer",
          color,
          marginLeft: "5px",
          marginRight: "5px",
        }}
        className={is_new_chat ? "smc-chat-notification" : undefined}
      >
        {is_chat_open && (
          <span
            style={{ marginLeft: "5px", marginRight: "5px", color: "#428bca" }}
          >
            <VideoChatButton project_id={project_id} path={path} short={true} />
          </span>
        )}
        <Tip
          title={title}
          tip={CHAT_INDICATOR_TIP}
          placement={"leftTop"}
          delayShow={3000}
          stable={false}
        >
          <span onClick={toggle_chat}>
            <Icon name={`caret-${is_chat_open ? "down" : "left"}`} />
            <Space />
            <Icon name="comment" />
            {!shrink_fixed_tabs && (
              <span style={{ fontSize: "10.5pt", marginLeft: "5px" }}>
                Chat
              </span>
            )}
          </span>
        </Tip>
      </div>
    );
  }

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
      {render_chat_button()}
    </div>
  );
};
