/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { MentionList } from "./store";

export function generate_name(project_id: string, path: string) {
  return `editor-${project_id}-${path}`;
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
