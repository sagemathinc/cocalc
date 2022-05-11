/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { throttle } from "lodash";
import { original_path } from "@cocalc/util/misc";

import { redux } from "../app-framework";

import { MentionList } from "./store";
import { Message } from "./types";

export const INPUT_HEIGHT = "130px";

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
  mentions: MentionList
) {
  let index_offset = 0;
  let usuable_cursor_index = cursor_plain_text_index;
  const mention_array = mentions.toJS();

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
      usuable_cursor_index = plainTextIndex + display.length;
      if (i == mention_array.length - 1) {
        // Cursor is inside the second half of the last mention.
        index_offset = mention_offset + id.length + SINGLE_MENTION_OFFSET;
      }
    } else if (cursor_plain_text_index <= plainTextIndex + display.length / 2) {
      // Cursor is inside the first half of this mention
      usuable_cursor_index = plainTextIndex;
      index_offset = mention_offset;
      break;
    }
  }
  return index_offset + usuable_cursor_index;
}

export function newest_content(message: Message): string {
  return message.get("history")?.first()?.get("content") ?? "";
}

export function sender_is_viewer(
  account_id: string,
  message: Message
): boolean {
  return account_id == message.get("sender_id");
}

export function message_colors(
  account_id: string,
  message: Message
): {
  background: string;
  color: string;
  message_class: string;
  lighten?: { color: string };
} {
  if (sender_is_viewer(account_id, message)) {
    return {
      background: "#46b1f6",
      color: "#fff",
      message_class: "smc-message-from-viewer",
    };
  } else {
    return {
      background: "#f8f8f8",
      color: "#000",
      lighten: { color: "#888" },
      message_class: "smc-message-from-other",
    };
  }
}

export function is_editing(message: Message, account_id: string): boolean {
  return message.get("editing")?.has(account_id);
}

export const mark_chat_as_read_if_unseen: (
  project_id: string,
  path: string
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
