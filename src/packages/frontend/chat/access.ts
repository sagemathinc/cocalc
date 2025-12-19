/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Lightweight accessors for ChatMessage objects (plain/Immer).

import type { ChatMessage, MessageHistory } from "./types";

export function field<T = any>(
  obj: ChatMessage | undefined,
  key: string,
): T | undefined {
  if (obj == null) return undefined;
  return (obj as any)[key] as T;
}

export function historyArray(
  msg: Partial<ChatMessage> | undefined,
): MessageHistory[] {
  if (!msg) return [];
  const h = msg.history;
  return Array.isArray(h) ? h : [];
}

export function firstHistory(
  msg: ChatMessage | undefined,
): MessageHistory | undefined {
  const h = historyArray(msg);
  return h.length > 0 ? h[0] : undefined;
}

export function dateValue(msg: ChatMessage | undefined): Date | undefined {
  if (!msg) return undefined;
  const d = msg.date;
  if (d instanceof Date) return d;
  if (typeof d === "string" || typeof d === "number") {
    const dt = new Date(d);
    return isNaN(dt.valueOf()) ? undefined : dt;
  }
  return undefined;
}

export function senderId(msg: ChatMessage | undefined): string | undefined {
  return msg?.sender_id;
}

export function replyTo(msg: ChatMessage | undefined): string | undefined {
  return msg?.reply_to;
}

// Return list of account IDs currently editing the message.
export function editingArray(msg: ChatMessage | undefined): string[] {
  const editing = msg?.editing;
  return Array.isArray(editing) ? editing : [];
}

export function foldingList(msg: ChatMessage | undefined): string[] {
  const folding = msg?.folding;
  return Array.isArray(folding) ? folding : [];
}
