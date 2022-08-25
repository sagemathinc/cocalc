/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { TypedMap } from "@cocalc/frontend/app-framework";
import { Map } from "immutable";

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

export type MentionFilter = "read" | "unread" | "saved" | "all";
