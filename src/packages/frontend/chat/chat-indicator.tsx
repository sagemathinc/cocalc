/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { filename_extension } from "@cocalc/util/misc";
import { Button, Space, Tooltip } from "antd";
import { debounce } from "lodash";
import { useMemo } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { UsersViewing } from "@cocalc/frontend/account/avatar/users-viewing";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { AIAvatar, HiddenXS } from "@cocalc/frontend/components";
import { Icon } from "@cocalc/frontend/components/icon";
import { hasEmbeddedAgent } from "@cocalc/frontend/frame-editors/generic/has-embedded-agent";
import track from "@cocalc/frontend/user-tracking";
import { labels } from "../i18n";

export type ChatState =
  | "" // not opened (also undefined counts as not open)
  | "internal" // chat is open and managed internally (via frame tree)
  | "external" // chat is open and managed externally (e.g., legacy sage worksheet)
  | "pending"; // chat should be opened when the file itself is actually initialized.

const CHAT_INDICATOR_STYLE: React.CSSProperties = {
  fontSize: "15pt",
  paddingTop: "2px",
  cursor: "pointer",
  background: "#e8e8e8",
  borderTop: "2px solid lightgrey",
} as const;

const USERS_VIEWING_STYLE: React.CSSProperties = {
  maxWidth: "120px",
  marginRight: "5px",
} as const;

interface Props {
  project_id: string;
  path: string;
  chatState?: ChatState;
}

export function ChatIndicator({ project_id, path, chatState }: Props) {
  const style: React.CSSProperties = {
    ...CHAT_INDICATOR_STYLE,
    ...{ display: "flex" },
  };

  return (
    <div style={style}>
      <UsersViewing
        project_id={project_id}
        path={path}
        style={USERS_VIEWING_STYLE}
      />
      <ChatButtons
        project_id={project_id}
        path={path}
        chatState={chatState}
      />
    </div>
  );
}

function ChatButtons({ project_id, path, chatState }) {
  const intl = useIntl();

  const toggleChat = useMemo(
    () =>
      debounce(
        (mode?: "chat" | "assistant") => {
          const actions = redux.getProjectActions(project_id);
          track(chatState ? "toggle-chat" : "open-chat", {
            project_id,
            path,
            how: "chat-button",
            mode,
          });
          actions.toggle_chat({ path, chat_mode: mode });
        },
        1000,
        { leading: true },
      ),
    [project_id, path, chatState],
  );

  const fileUse = useTypedRedux("file_use", "file_use");
  const isNewChat = useMemo(
    () =>
      !!redux.getStore("file_use")?.get_file_info(project_id, path)
        ?.is_unseenchat,
    [fileUse, project_id, path],
  );

  if (filename_extension(path) === "sage-chat") {
    // Special case: do not show side chat for chatrooms
    return null;
  }

  const showAI =
    hasEmbeddedAgent(path) &&
    redux.getStore("projects").hasLanguageModelEnabled(project_id);

  const chatButton = (
    <Tooltip
      title={
        <span>
          <Icon name="comment" style={{ marginRight: "5px" }} />
          <FormattedMessage
            id="chat.chat-indicator.tooltip"
            defaultMessage={"Hide or Show Document Chat"}
          />
        </span>
      }
      placement={"leftTop"}
      mouseEnterDelay={0.5}
    >
      <Button
        type="text"
        danger={isNewChat}
        className={isNewChat ? "smc-chat-notification" : undefined}
        onClick={() => toggleChat("chat")}
        style={{ background: chatState ? "white" : undefined }}
      >
        <Icon name="comment" />
        <HiddenXS>
          <span style={{ marginLeft: "5px" }}>
            {intl.formatMessage(labels.chat)}
          </span>
        </HiddenXS>
      </Button>
    </Tooltip>
  );

  if (!showAI) {
    return chatButton;
  }

  return (
    <Space.Compact>
      <Tooltip
        title={
          <FormattedMessage
            id="chat.chat-indicator.ai-tooltip"
            defaultMessage={"AI Assistant"}
          />
        }
        placement={"leftTop"}
        mouseEnterDelay={0.5}
      >
        <Button
          type="text"
          onClick={() => toggleChat("assistant")}
          style={{
            background: chatState ? "white" : undefined,
            padding: "4px 6px",
          }}
        >
          <AIAvatar
            size={16}
            backgroundColor="#f60"
            iconColor="white"
            style={{ borderRadius: 3 }}
            innerStyle={{ borderRadius: 3 }}
          />
        </Button>
      </Tooltip>
      {chatButton}
    </Space.Compact>
  );
}
