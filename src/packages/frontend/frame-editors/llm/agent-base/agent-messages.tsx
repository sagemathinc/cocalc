/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared messages list for agent panels.  Maps messages with per-sender
styling and delegates content rendering to a caller-provided function,
allowing each agent to customize how messages are displayed (e.g.
collapsible diffs for the coding agent, tool results for the notebook
agent).
*/

import { Spin } from "antd";

import { redux, useRedux } from "@cocalc/frontend/app-framework";
import { Paragraph } from "@cocalc/frontend/components";

import type { AgentSession, DisplayMessage } from "./types";
import {
  ASSISTANT_MSG_STYLE,
  ERROR_MSG_STYLE,
  MESSAGES_STYLE,
  SYSTEM_MSG_STYLE,
  USER_MSG_STYLE,
} from "./types";

interface AgentMessagesProps {
  session: AgentSession;
  /**
   * Render the content of a single message.  Called for every message;
   * the component handles the outer container div and sender-based
   * styling.
   */
  renderMessage: (msg: DisplayMessage, index: number) => React.ReactNode;
  /** Placeholder text shown when there are no messages. */
  emptyText?: string;
  /**
   * Optional function to compute the style for a message.
   * Defaults to sender-based styling (user/assistant/system).
   */
  messageStyle?: (msg: DisplayMessage) => React.CSSProperties;
  /** Font size in pixels — from the frame's zoom level. */
  fontSize?: number;
}

function defaultMessageStyle(msg: DisplayMessage): React.CSSProperties {
  if (msg.sender === "user") return USER_MSG_STYLE;
  if (msg.sender === "system") {
    // Error messages (stream failures, apply failures, etc.)
    if (msg.event === "error") return ERROR_MSG_STYLE;
    // show_lines messages use a neutral gray — they're auto-fulfilled
    // context, not important system notifications.
    if (msg.event === "show_lines") return USER_MSG_STYLE;
    return SYSTEM_MSG_STYLE;
  }
  return ASSISTANT_MSG_STYLE;
}

export function AgentMessages({
  session,
  renderMessage,
  emptyText = "Send a message to get started.",
  messageStyle = defaultMessageStyle,
  fontSize,
}: AgentMessagesProps) {
  const { messages, generating, messagesEndRef } = session;
  useRedux(["users", "user_map"]);

  function getAuthorName(accountId?: string): string | undefined {
    if (!accountId) return;
    return redux.getStore("users")?.get_name(accountId)?.trim() || undefined;
  }

  return (
    <div
      className="cocalc-force-scrollbar"
      style={{
        ...MESSAGES_STYLE,
        ...(fontSize != null ? { fontSize: `${fontSize}px` } : undefined),
      }}
    >
      {messages.length === 0 && (
        <Paragraph
          style={{
            color: "var(--cocalc-text-primary, #5f5f5f)",
            textAlign: "center",
            marginTop: 20,
            marginLeft: 5,
            marginRight: 5,
          }}
        >
          {emptyText}
        </Paragraph>
      )}
      {messages.map((msg, i) => {
        const content = renderMessage(msg, i);
        if (content == null) return null;
        const authorName =
          msg.sender === "user" ? getAuthorName(msg.account_id) : undefined;
        return (
          <div key={`${msg.date}-${i}`} style={messageStyle(msg)}>
            {authorName && (
              <div
                style={{
                  color: "var(--cocalc-text-primary, #5f5f5f)",
                  fontSize: "0.8em",
                  marginBottom: 4,
                }}
              >
                {authorName}
              </div>
            )}
            {content}
          </div>
        );
      })}
      {generating && (
        <div style={{ textAlign: "center", padding: 8 }}>
          <Spin size="small" />
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
