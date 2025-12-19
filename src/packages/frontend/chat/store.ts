/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Store } from "@cocalc/frontend/app-framework";
import { Map as ImmutableMap } from "immutable";

export interface ChatState {
  project_id?: string;
  path?: string;
  height: number; // 0 means not rendered; otherwise is the height of the chat editor
  message_plain_text: string; // What the user sees in the chat box eg. stripped of internal mention markup
  drafts?: Map<string, any>;
  // last activity timestamp per thread (ms since epoch)
  activity?: ImmutableMap<string, number>;
  // true after the initial sync replay has finished
  activityReady?: boolean;
  offset?: number; // information about where on screen the chat editor is located
  position?: number; // more info about where chat editor is located
  saved_position?: number;
  search: string;
  add_collab: boolean;
  // timestamp when syncdb was attached (to trigger rerenders)
  syncdbReady?: number;
  acpState: ImmutableMap<
    string, // key = ms since epoch as **string**
    string // e.g.,    "queue" | "sending" | "sent" | "running"
  >; // iso strings
}

export function getInitialState() {
  return {
    height: 0,
    message_plain_text: "",
    drafts: undefined,
    activity: undefined,
    activityReady: false,
    offset: undefined,
    position: undefined,
    saved_position: undefined,
    search: "",
    add_collab: false,
    syncdbReady: undefined,
    acpState: ImmutableMap<string, string>(),
  };
}

export class ChatStore extends Store<ChatState> {
  getInitialState = () => getInitialState();
}
