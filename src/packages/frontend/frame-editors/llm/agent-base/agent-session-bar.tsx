/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared session (turns) bar.

Layout:
  [+ New] [Turn N ▾] <Space.Compact>[✨ auto-name] [✏ rename]</Space.Compact>
  [🗑 clear] << flex space >> [extra buttons e.g. Build]
*/

import { Button, Dropdown, Popconfirm, Space, Tooltip } from "antd";
import { useMemo } from "react";

import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

import type { AgentSession } from "./types";

interface AgentSessionBarProps {
  session: AgentSession;
  /** Callback to auto-name the current turn via LLM. */
  onAutoName?: () => void;
  /** Callback to open a rename UI for the current turn. */
  onRename?: () => void;
  /** Optional extra buttons rendered at the far right (e.g. Build). */
  extraButtons?: React.ReactNode;
}

export function AgentSessionBar({
  session,
  onAutoName,
  onRename,
  extraButtons,
}: AgentSessionBarProps) {
  const {
    sessionId,
    allSessions,
    sessionNames,
    messages,
    setSessionId,
    handleNewSession,
    handleClearSession,
  } = session;

  const turnsMenuItems = useMemo(() => {
    return allSessions
      .map((sid, i) => {
        const name = sessionNames.get(sid);
        const label = name ? `${name}` : `Turn ${i + 1}`;
        return {
          key: sid,
          label: `${label}${sid === sessionId ? "  \u2022" : ""}`,
        };
      })
      .reverse();
  }, [allSessions, sessionId, sessionNames]);

  const currentSessionLabel = useMemo(() => {
    if (!sessionId) return "Turns";
    const name = sessionNames.get(sessionId);
    if (name) return name;
    const idx = allSessions.indexOf(sessionId);
    return idx >= 0 ? `Turn ${idx + 1}` : "Turns";
  }, [sessionId, sessionNames, allSessions]);

  const hasSession = !!sessionId;
  const hasMessages = messages.length > 0;

  return (
    <div
      style={{
        flex: "0 0 auto",
        padding: "4px 12px",
        borderBottom: `1px solid ${COLORS.GRAY_L}`,
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: COLORS.GRAY_LLL,
      }}
    >
      <Button size="small" onClick={handleNewSession}>
        <Icon name="plus" /> New
      </Button>

      <Dropdown
        menu={{
          items: turnsMenuItems,
          onClick: ({ key }) => {
            setSessionId(key);
          },
        }}
        trigger={["click"]}
      >
        <Button size="small">
          <Icon name="history" />{" "}
          <span
            style={{
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "inline-block",
              verticalAlign: "middle",
            }}
          >
            {currentSessionLabel}
          </span>{" "}
          ({allSessions.length})
        </Button>
      </Dropdown>

      {hasSession && hasMessages && (onAutoName || onRename) && (
        <Space.Compact size="small">
          {onAutoName && (
            <Tooltip title="Auto-name this turn using AI">
              <Button
                size="small"
                onClick={onAutoName}
                icon={<Icon name="magic" />}
              />
            </Tooltip>
          )}
          {onRename && (
            <Tooltip title="Rename this turn">
              <Button
                size="small"
                onClick={onRename}
                icon={<Icon name="pencil" />}
              />
            </Tooltip>
          )}
        </Space.Compact>
      )}

      {hasSession && hasMessages && (
        <Popconfirm
          title="Clear all messages in this turn?"
          onConfirm={handleClearSession}
          okText="Clear"
          cancelText="Cancel"
        >
          <Button size="small" danger>
            <Icon name="trash" />
          </Button>
        </Popconfirm>
      )}

      <div style={{ flex: 1 }} />

      {extraButtons}
    </div>
  );
}
