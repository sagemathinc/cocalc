import { List, Map } from "immutable";
import { MutableRefObject } from "react";

import { TypedMap } from "@cocalc/frontend/app-framework";
import { FragmentId } from "@cocalc/frontend/misc/fragment-id";

export type Mode = "standalone" | "sidechat";

const FEEDBACKS = ["positive", "negative"] as const;
export type Feedback = (typeof FEEDBACKS)[number];
export function isFeedback(feedback: unknown): feedback is Feedback {
  if (typeof feedback !== "string") return false;
  return FEEDBACKS.includes(feedback as Feedback);
}

type Mention = TypedMap<{
  id: string;
  display: string;
  type?: string;
  index: number;
  plainTextIndex: number;
}>;

export type MentionList = List<Mention>;

export interface MessageHistory {
  author_id: string; // account UUID or language model service
  content: string; // markdown
  date: string; // date.toISOString()
}

export interface ChatMessage {
  sender_id: string;
  event: "chat";
  history: MessageHistory[];
  date: Date | string; // string is used to create it
  reply_to?: string;
  generating?: boolean;
  editing?: { [author_id: string]: "FUTURE" | null };
  folding?: string[];
}

export type ChatMessageTyped = TypedMap<{
  sender_id: string;
  event: "chat";
  history: List<TypedMap<MessageHistory>>;
  date: Date;
  reply_to?: string;
  generating?: boolean;
  editing: TypedMap<{
    [author_id: string]: "FUTURE" | null;
  }>;
  folding?: List<string>;
  feedback?: Map<string, Feedback>; // encoded as map of {[account_id]:Feedback}
}>;

export type ChatMessages = TypedMap<{
  // NOTE: the number is the epoch timestamp, but it is also sometimes a string
  // both point to the same message
  [date: number | string]: ChatMessageTyped;
}>;

export type SubmitMentionsFn = (
  fragmentId?: FragmentId,
  onlyValue?: boolean,
) => string;

export type SubmitMentionsRef = MutableRefObject<SubmitMentionsFn | undefined>;
