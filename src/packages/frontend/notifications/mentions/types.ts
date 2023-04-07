/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";

import { TypedMap } from "@cocalc/frontend/app-framework";
import { NewsFilter } from "../news/types";

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

export type MentionsFilter = "read" | "unread" | "saved" | "all";
export type NotificationFilter = MentionsFilter | NewsFilter;
