/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { filename_extension } from "@cocalc/util/misc";
import { Button, Space, Tooltip } from "antd";
import { COLORS } from "@cocalc/util/theme";
import { useCallback, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { UsersViewing } from "@cocalc/frontend/account/avatar/users-viewing";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { AIAvatar } from "@cocalc/frontend/components";
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
  cursor: "pointer",
  background: COLORS.GRAY_L0,
  borderTop: `2px solid ${COLORS.GRAY_L}`,
  height: "100%",
} as const;

const USERS_VIEWING_STYLE: React.CSSProperties = {
  maxWidth: "120px",
  marginRight: "5px",
} as const;

interface Props {
  project_id: string;
  path: string;
  chatState?: ChatState;
  chatMode?: "chat" | "assistant" | "";
}

export function ChatIndicator({
  project_id,
  path,
  chatState,
  chatMode,
}: Props) {
  const style: React.CSSProperties = {
    ...CHAT_INDICATOR_STYLE,
    ...{ display: "flex", alignItems: "center" as const },
    background: `var(--cocalc-top-bar-bg, ${COLORS.GRAY_L0})`,
    borderTop: `2px solid var(--cocalc-border-light, ${COLORS.GRAY_L})`,
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
        chatMode={chatMode}
      />
    </div>
  );
}

function ChatButtons({ project_id, path, chatState, chatMode }) {
  const intl = useIntl();
  const [hoverAI, setHoverAI] = useState(false);
  const [hoverChat, setHoverChat] = useState(false);
  const lastToggleRef = useRef<{
    mode?: "chat" | "assistant";
    at: number;
  }>({ at: 0 });

  const toggleChat = useCallback(
    (mode?: "chat" | "assistant") => {
      const now = Date.now();
      if (
        lastToggleRef.current.mode === mode &&
        now - lastToggleRef.current.at < 350
      ) {
        return;
      }
      lastToggleRef.current = { mode, at: now };
      const actions = redux.getProjectActions(project_id);
      track(chatState ? "toggle-chat" : "open-chat", {
        project_id,
        path,
        how: "chat-button",
        mode,
      });
      actions.toggle_chat({ path, chat_mode: mode });
    },
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

  const aiActive = !!chatState && chatMode === "assistant";
  const chatActive = !!chatState && chatMode !== "assistant";

  const borderColor = `var(--cocalc-border-light, ${COLORS.GRAY_L})`;
  const buttonHoverBg = `var(--cocalc-top-bar-hover, ${COLORS.GRAY_LLL})`;
  const buttonActiveBg = `var(--cocalc-top-bar-active, white)`;
  const buttonText = `var(--cocalc-top-bar-text, ${COLORS.GRAY})`;
  const buttonTextActive = `var(--cocalc-top-bar-text, ${COLORS.GRAY})`;
  const aiButtonActiveBg = `var(--cocalc-ai-bg, ${COLORS.AI_ASSISTANT_BG})`;
  const aiButtonActiveText = `var(--cocalc-ai-text, ${COLORS.AI_ASSISTANT_TXT})`;

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
      placement={"top"}
      mouseEnterDelay={0.5}
    >
      <Button
        danger={isNewChat}
        className={isNewChat ? "smc-chat-notification" : undefined}
        onClick={() => toggleChat("chat")}
        onMouseEnter={() => setHoverChat(true)}
        onMouseLeave={() => setHoverChat(false)}
        style={{
          background: chatActive
            ? buttonActiveBg
            : hoverChat
              ? buttonHoverBg
              : "transparent",
          borderColor,
          color: chatActive ? buttonTextActive : buttonText,
        }}
      >
        <Icon name="comment" />
        <span style={{ marginLeft: "5px" }}>
          {intl.formatMessage(labels.chat)}
        </span>
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
        placement={"top"}
        mouseEnterDelay={0.5}
      >
        <Button
          onClick={() => toggleChat("assistant")}
          onMouseEnter={() => setHoverAI(true)}
          onMouseLeave={() => setHoverAI(false)}
          style={{
            background: aiActive
              ? aiButtonActiveBg
              : hoverAI
                ? buttonHoverBg
                : "transparent",
            borderColor,
            color: aiActive ? aiButtonActiveText : buttonText,
            padding: "4px 8px",
          }}
        >
          <AIAvatar size={16} iconColor="currentColor" />
          <span style={{ marginLeft: "5px" }}>AI</span>
        </Button>
      </Tooltip>
      {chatButton}
    </Space.Compact>
  );
}
