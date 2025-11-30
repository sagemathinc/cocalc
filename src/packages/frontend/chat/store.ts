/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Store } from "@cocalc/frontend/app-framework";
import type { ChatMessages } from "./types";
import type { Map as ImmutableMap } from "immutable";

export interface ChatState {
  project_id?: string;
  path?: string;
  height: number; // 0 means not rendered; otherwise is the height of the chat editor
  message_plain_text: string; // What the user sees in the chat box eg. stripped of internal mention markup
  messages?: ChatMessages;
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
}

export function getInitialState() {
  return {
    height: 0,
    message_plain_text: "",
    messages: undefined,
    drafts: undefined,
    activity: undefined,
    activityReady: false,
    offset: undefined,
    position: undefined,
    saved_position: undefined,
    search: "",
    add_collab: false,
  };
}

export class ChatStore extends Store<ChatState> {
  getInitialState = () => getInitialState();
}
