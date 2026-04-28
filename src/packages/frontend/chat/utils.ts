/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { throttle } from "lodash";
import { redux } from "@cocalc/frontend/app-framework";
import { original_path } from "@cocalc/util/misc";
import {
  VIEWER_BG,
  VIEWER_COLOR,
  OTHER_BG,
  OTHER_COLOR,
  OTHER_SECONDARY,
} from "./chat-colors";
import type {
  ChatMessageTyped,
  MentionList,
  ChatMessages,
  ChatMessage,
} from "./types";
import { is_date as isDate } from "@cocalc/util/misc";

export const INPUT_HEIGHT = "125px";

/**
 * Read the *active* anchor id stamped on a chat message's root, preferring
 * the current `id` field but falling back to the legacy `cell_id` field so
 * notebooks with pre-rename chat data continue to find their threads.
 *
 * Returns `undefined` when the root message has been marked `resolved`, so
 * resolved (LaTeX collaborative-TODO) threads are never treated as live
 * anchors regardless of whether the `id` field was actually cleared. Use
 * `formerAnchorIdOf` to read the hash a resolved thread once had.
 */
export function anchorIdOf(
  msg: ChatMessageTyped | undefined,
): string | undefined {
  if (msg == null) return undefined;
  if (msg.get("resolved") != null) return undefined;
  const v = msg.get("id") ?? msg.get("cell_id");
  return typeof v === "string" ? v : undefined;
}

/**
 * Read the former anchor id of a resolved root message, or `undefined` if
 * the message is not resolved (or wasn't anchored). Used by stale-marker
 * detection in the LaTeX editor.
 */
export function formerAnchorIdOf(
  msg: ChatMessageTyped | undefined,
): string | undefined {
  if (msg == null) return undefined;
  const r = msg.get("resolved");
  if (r == null) return undefined;
  const v =
    typeof (r as any).get === "function"
      ? (r as any).get("anchorId")
      : (r as any).anchorId;
  return typeof v === "string" ? v : undefined;
}

export const USER_MENTION_MARKUP =
  '<span class="user-mention" account-id=__id__ >@__display__</span>';

const USER_MENTION_MARKUP_WITHOUT_PLACEHOLDERS =
  '<span class="user-mention" account-id= ></span>';

const SINGLE_MENTION_OFFSET = USER_MENTION_MARKUP_WITHOUT_PLACEHOLDERS.length;

/*
  Given plain text which looks like
  ```
    @person name you need to do this.
  ```
  `cursor_plain_text_index` in that text,
  and `mentions` from react-mentions,

  return the cursor position in the backing text which looks like
  ```
    <span class-name="user-mention" account-id= 72583e2b-3ea3-431c-892f-2b9616e6754e >@person name</span> you need to do this.
  ```
*/
export function compute_cursor_offset_position(
  cursor_plain_text_index: number,
  mentions: MentionList,
) {
  let index_offset = 0;
  let usable_cursor_index = cursor_plain_text_index;
  const mention_array = mentions.toJS() as any;

  for (let i = 0; i < mention_array.length; i++) {
    const current_mention = mention_array[i];
    const { id, display, index, plainTextIndex } = current_mention;
    const mention_offset = index - plainTextIndex;

    if (cursor_plain_text_index <= plainTextIndex) {
      // Cursor is in front of this mention. ie. " asdfas |@jim" where | is the cursor
      index_offset = mention_offset;
      break;
    } else if (cursor_plain_text_index >= plainTextIndex + display.length) {
      if (i == mention_array.length - 1) {
        // Cursor is after last mention.
        index_offset = mention_offset + id.length + SINGLE_MENTION_OFFSET;
      }
    } else if (cursor_plain_text_index > plainTextIndex + display.length / 2) {
      usable_cursor_index = plainTextIndex + display.length;
      if (i == mention_array.length - 1) {
        // Cursor is inside the second half of the last mention.
        index_offset = mention_offset + id.length + SINGLE_MENTION_OFFSET;
      }
    } else if (cursor_plain_text_index <= plainTextIndex + display.length / 2) {
      // Cursor is inside the first half of this mention
      usable_cursor_index = plainTextIndex;
      index_offset = mention_offset;
      break;
    }
  }
  return index_offset + usable_cursor_index;
}

export function newest_content(message: ChatMessageTyped): string {
  const history = message.get("history");
  return history?.first()?.get("content") ?? "";
}

export function sender_is_viewer(
  account_id: string,
  message: ChatMessageTyped,
): boolean {
  return account_id == message.get("sender_id");
}

export function message_colors(
  account_id: string,
  message: ChatMessageTyped,
): {
  background: string;
  color: string;
  message_class: string;
  lighten?: { color: string };
} {
  if (sender_is_viewer(account_id, message)) {
    return {
      background: VIEWER_BG,
      color: VIEWER_COLOR,
      message_class: "smc-message-from-viewer",
    };
  } else {
    return {
      background: OTHER_BG,
      color: OTHER_COLOR,
      lighten: { color: OTHER_SECONDARY },
      message_class: "smc-message-from-other",
    };
  }
}

export function is_editing(
  message: ChatMessageTyped,
  account_id: string,
): boolean {
  return message.get("editing")?.has(account_id);
}

export const markChatAsReadIfUnseen: (
  project_id: string,
  path: string,
) => void = throttle((project_id: string, path: string) => {
  const info = redux
    ?.getStore("file_use")
    ?.get_file_info(project_id, original_path(path));
  if (info == null || info.is_unseenchat) {
    // only mark chat as read if it is unseen
    const actions = redux?.getActions("file_use");
    if (actions == null) return;
    actions.mark_file(project_id, path, "read");
    actions.mark_file(project_id, path, "chatseen");
  }
}, 3000);

export function getSelectedHashtagsSearch(hashtags): {
  selectedHashtags: Set<string>;
  selectedHashtagsSearch: string;
} {
  const X = new Set<string>([]);
  if (hashtags == null)
    return { selectedHashtags: X, selectedHashtagsSearch: "" };
  for (const [key] of hashtags) {
    if (hashtags.get(key) == 1) {
      // only care about visible hashtags
      X.add(key);
    }
  }
  return {
    selectedHashtags: X,
    selectedHashtagsSearch: X.size > 0 ? " #" + Array.from(X).join(" #") : "",
  };
}

export function getRootMessage({
  message,
  messages,
}: {
  message: ChatMessage;
  messages: ChatMessages;
}): ChatMessageTyped | undefined {
  const { reply_to, date } = message;
  // we can't find the original message, if there is no reply_to
  if (!reply_to) {
    // the msssage itself is the root
    return messages.get(`${new Date(date).valueOf()}`);
  } else {
    // All messages in a thread have the same reply_to, which points to the root.
    return messages.get(`${new Date(reply_to).valueOf()}`);
  }
}

export function getReplyToRoot({
  message,
  messages,
}: {
  message: ChatMessage;
  messages: ChatMessages;
}): Date | undefined {
  const root = getRootMessage({ message, messages });
  const date = root?.get("date");
  // date is a "Date" object, but we're just double checking it is not a string by accident
  return date ? new Date(date) : undefined;
}

export function getThreadRootDate({
  date,
  messages,
}: {
  date: number;
  messages?: ChatMessages;
}): number {
  if (messages == null) {
    return 0;
  }
  const message = messages.get(`${date}`)?.toJS();
  if (message == null) {
    return 0;
  }
  const d = getReplyToRoot({ message, messages });
  return d?.valueOf() ?? 0;
}

/**
 * True iff the thread containing this message has been resolved (LaTeX
 * collaborative-TODO flow). Walks to the thread root and checks
 * `resolved`. Used to gate per-thread Reply buttons in the all-threads
 * view, where the per-thread composer doesn't run.
 */
export function isThreadResolved({
  date,
  messages,
}: {
  date: number;
  messages?: ChatMessages;
}): boolean {
  if (messages == null) return false;
  const rootMs = getThreadRootDate({ date, messages });
  if (!rootMs) return false;
  const root = messages.get(`${rootMs}`);
  if (root == null) return false;
  return root.get("resolved") != null;
}

// Use heuristics to try to turn "date", whatever it might be,
// into a string representation of the number of ms since the
// epoch.
const floatRegex = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
export function toMsString(date): string {
  if (isDate(date)) {
    return `${date.valueOf()}`;
  }

  switch (typeof date) {
    case "number":
      return `${date}`;
    case "string":
      if (floatRegex.test(date)) {
        return `${parseInt(date)}`;
      }
    default:
      return `${new Date(date).valueOf()}`;
  }
}
