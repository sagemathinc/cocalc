//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
//########################################################################

import { debounce } from "underscore";

import { copy, filename_extension } from "smc-util/misc2";
import { analytics_event } from "../tracker";
import { React, rclass, redux, rtypes, COLOR } from "../app-framework";
import { Icon, Tip, Space } from "../r_misc";
//import { VideoChatButton } from "../video-chat";
const { VideoChatButton } = require("../video-chat");
//import { UsersViewing } from "../other-users";
const { UsersViewing } = require("../other-users");

const CHAT_INDICATOR_STYLE = {
  fontSize: "14pt",
  borderRadius: "3px",
  marginTop: "3px",
};

const USERS_VIEWING_STYLE = {
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

export const ChatIndicator = rclass({
  reduxProps: {
    file_use: {
      file_use: rtypes.immutable,
    },
    page: {
      fullscreen: rtypes.oneOf(["default", "kiosk"]),
    },
  },

  propTypes: {
    project_id: rtypes.string.isRequired,
    path: rtypes.string.isRequired,
    is_chat_open: rtypes.bool,
    shrink_fixed_tabs: rtypes.bool,
  },

  componentWillMount() {
    return (this.toggle_chat = debounce(this.toggle_chat, 500, true));
  },

  toggle_chat() {
    const a = redux.getProjectActions(this.props.project_id);
    if (this.props.is_chat_open) {
      a.close_chat({ path: this.props.path });
      return analytics_event("side_chat", "close");
    } else {
      a.open_chat({ path: this.props.path });
      return analytics_event("side_chat", "open");
    }
  },

  is_new_chat() {
    return !!redux
      .getStore("file_use")
      ?.get_file_info(this.props.project_id, this.props.path)?.is_unseenchat;
  },

  render_users() {
    return (
      <UsersViewing
        project_id={this.props.project_id}
        path={this.props.path}
        style={USERS_VIEWING_STYLE}
      />
    );
  },

  render_video_button() {
    return (
      <span style={{ marginLeft: "5px", marginRight: "5px", color: "#428bca" }}>
        <VideoChatButton
          project_id={this.props.project_id}
          path={this.props.path}
          short={true}
        />
      </span>
    );
  },

  render_chat_label() {
    if (this.props.shrink_fixed_tabs) {
      return;
    }
    return <span style={{ fontSize: "10.5pt", marginLeft: "5px" }}>Chat</span>;
  },

  render_chat_button() {
    if (filename_extension(this.props.path) === "sage-chat") {
      // Special case: do not show side chat for chatrooms
      return;
    }

    const new_chat = this.is_new_chat();
    const color = new_chat ? COLOR.FG_RED : COLOR.FG_BLUE;
    const action = this.props.is_chat_open ? "Hide" : "Show";
    const title = (
      <span>
        <Icon name="comment" />
        <Space /> <Space /> {action} chat
      </span>
    );
    const dir = this.props.is_chat_open ? "down" : "left";
    const clz = new_chat ? "smc-chat-notification" : "";

    return (
      <div
        style={{
          cursor: "pointer",
          color,
          marginLeft: "5px",
          marginRight: "5px",
        }}
        className={clz}
      >
        {this.props.is_chat_open ? this.render_video_button() : undefined}
        <Tip
          title={title}
          tip={CHAT_INDICATOR_TIP}
          placement={"leftTop"}
          delayShow={2500}
          stable={false}
        >
          <span onClick={this.toggle_chat}>
            <Icon name={`caret-${dir}`} />
            <Space />
            <Icon name="comment" />
            {this.render_chat_label()}
          </span>
        </Tip>
      </div>
    );
  },

  render() {
    const style: React.CSSProperties = copy(CHAT_INDICATOR_STYLE);
    style.display = "flex";
    if (this.props.fullscreen) {
      style.top = "1px";
      style.right = "23px";
    } else {
      style.top = "-30px";
      style.right = "3px";
    }

    return (
      <div style={style}>
        {this.render_users()}
        {this.render_chat_button()}
      </div>
    );
  },
} as any);
