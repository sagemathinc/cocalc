/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";

import { TypedMap } from "@cocalc/frontend/app-framework";
import { NewsFilter, NEWS_CHANNELS } from "../news/types";
import {
  isMessagesFilter,
  Filter as MessagesFilter,
} from "@cocalc/frontend/messages/types";

export type MentionsMap = Map<string, MentionInfo>;

export type MentionInfo = TypedMap<{
  path: string;
  priority: number;
  project_id: string;
  source: string;
  target: string;
  time: Date;
  action?: "email" | "ignore";
  error?: string;
  description?: string;
  fragment_id?: string;
  users?: Map<
    string, // UUIDs
    TypedMap<{
      read?: boolean;
      saved?: boolean;
    }>
  >;
}>;

const MENTIONS_FILTER = ["read", "unread", "saved", "all"] as const;

export type MentionsFilter = (typeof MENTIONS_FILTER)[number];
export type NotificationFilter = MentionsFilter | NewsFilter | MessagesFilter;

export function isNotificationFilter(f: string): f is NotificationFilter {
  return (
    MENTIONS_FILTER.includes(f as any) ||
    NEWS_CHANNELS.includes(f as any) ||
    isMessagesFilter(f)
  );
}
