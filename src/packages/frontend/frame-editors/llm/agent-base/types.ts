/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared types, constants, and styles for all agent variants
(coding agent, notebook agent, future agents).
*/

import type { CSS } from "@cocalc/frontend/app-framework";
import { COLORS } from "@cocalc/util/theme";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DisplayMessage {
  sender: "user" | "assistant" | "system";
  content: string;
  date: string;
  event: string;
  account_id?: string;
  /** Coding agent stores a document snapshot for three-way merge. */
  base_snapshot?: string;
}

/** Parameters accepted by the shared writeMessage helper. */
export interface WriteMessageParams {
  date: string;
  sender: "user" | "assistant" | "system";
  content: string;
  account_id?: string;
  msg_event: string;
  base_snapshot?: string;
  session_id?: string;
}

/** The return type of the useAgentSession hook. */
export interface AgentSession {
  // State
  syncdb: any;
  messages: DisplayMessage[];
  sessionId: string;
  allSessions: string[];
  sessionNames: Map<string, string>;
  generating: boolean;
  error: string;

  // Setters
  setGenerating: (v: boolean) => void;
  setError: (v: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<DisplayMessage[]>>;

  // Actions
  writeMessage: (msg: WriteMessageParams) => void;
  handleNewSession: () => void;
  handleClearSession: () => void;
  writeSessionName: (name: string, sid?: string) => void;
  setSessionId: (id: string) => void;

  // Refs
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  cancelRef: React.MutableRefObject<boolean>;
  sessionIdRef: React.MutableRefObject<string>;
  pendingNewSessionRef: React.MutableRefObject<string>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const SYNCDB_CHANGE_THROTTLE = 300;

/**
 * Sender ID used in the chat syncdb for non-user messages.
 * Primary key in chat syncdb is (date, sender_id, event), so each
 * agent type needs a unique prefix to avoid collisions with real
 * user account IDs (which are UUIDs like "xxxxxxxx-xxxx-...").
 * The "agent:" prefix ensures this can never match a UUID.
 */
export function agentSenderId(
  eventName: string,
  sender: "assistant" | "system",
): string {
  return `agent:${eventName}:${sender}`;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

export const CONTAINER_STYLE: CSS = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden",
} as const;

export const MESSAGES_STYLE: CSS = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
} as const;

export const USER_MSG_STYLE: CSS = {
  background: COLORS.GRAY_LLL,
  padding: "8px 12px",
  marginBottom: 8,
  whiteSpace: "pre-wrap",
} as const;

export const ASSISTANT_MSG_STYLE: CSS = {
  marginBottom: 8,
  padding: "8px 12px",
} as const;

export const SYSTEM_MSG_STYLE: CSS = {
  marginBottom: 8,
  padding: "8px 12px",
  background: COLORS.BS_GREEN_LL,
  borderRadius: 8,
  fontSize: "0.9em",
} as const;

export const ERROR_MSG_STYLE: CSS = {
  marginBottom: 8,
  padding: "8px 12px",
  background: COLORS.ANTD_BG_RED_L,
  border: `1px solid ${COLORS.ANTD_BG_RED_M}`,
  borderRadius: 8,
  fontSize: "0.9em",
} as const;

export const INPUT_AREA_STYLE: CSS = {
  flex: "0 0 auto",
  borderTop: `1px solid ${COLORS.GRAY_L}`,
  padding: "8px 12px",
} as const;
