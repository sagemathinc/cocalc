import { MutableRefObject } from "react";

import { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import type { ChatMessage as SharedChatMessage } from "@cocalc/chat";
export { addToHistory } from "@cocalc/chat";

export type Mode = "standalone" | "sidechat";

const FEEDBACKS = ["positive", "negative"] as const;
export type Feedback = (typeof FEEDBACKS)[number];
export function isFeedback(feedback: unknown): feedback is Feedback {
  if (typeof feedback !== "string") return false;
  return FEEDBACKS.includes(feedback as Feedback);
}

export type Mention = {
  id: string;
  display: string;
  type?: string;
  index: number;
  plainTextIndex: number;
};

export type MentionList = Mention[];

export interface MessageHistory {
  author_id: string;
  content: string;
  date: string; // ISO string
}

// Plain chat message shape used by the Immer-based syncdoc flow.
export interface PlainChatMessage {
  sender_id: string;
  event: "chat";
  history: MessageHistory[];
  date: Date;
  reply_to?: string;
  generating?: boolean;
  editing: Record<string, any>;
  folding?: string[];
  feedback?: Record<string, Feedback>;
  name?: string;
  pin?: boolean | string | number;
  schema_version?: number;
  acp_usage?: any;
  acp_log_store?: any;
  acp_log_info?: any;
  [key: string]: any;
}

// Legacy alias for shared/chat consumers; the shared type is also plain.
export type ChatMessage = SharedChatMessage | PlainChatMessage;

export type ChatMessageTyped = PlainChatMessage;

// Map keyed by millisecond timestamp (stringified) to message.
export type ChatMessages = Map<string, ChatMessageTyped>;

// this type isn't explicitly used anywhere yet, but the actual structure is and I just
// wanted to document it.
export interface Draft {
  event: "draft";
  // account_id of the user writing this draft
  sender_id: string;
  // ms since epoch when this draft was last edited.  This is used to show a message to
  // other users that one user is writing a message.
  active: number;
  // date = 0 when composing an entirely new message
  // data = -[timestamp in ms] of the message being replied to
  date: number;
  // input = string contents of current version of the message
  input: "string";
}

export type SubmitMentionsFn = (
  fragmentId?: FragmentId,
  onlyValue?: boolean,
) => string;

export type SubmitMentionsRef = MutableRefObject<SubmitMentionsFn | undefined>;

export type NumChildren = { [date: number]: number };

export type CostEstimate = { min: number; max: number } | null;
