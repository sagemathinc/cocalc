import { MentionList } from "./store";

import { USER_MENTION_MARKUP_WITHOUT_PLACEHOLDERS } from "./input";

export function generate_name(project_id: string, path: string) {
  return `editor-${project_id}-${path}`;
}

const SINGLE_MENTION_OFFSET =
  USER_MENTION_MARKUP_WITHOUT_PLACEHOLDERS.length + 36;

// TODO: Cover highlight and replace case
export function compute_cursor_offset_position(
  cursor_plain_text_index: number,
  mentions: MentionList
) {
  let index_offset = 0;
  let usuable_cursor_index = cursor_plain_text_index;
  const mention_array = mentions.toJS();

  for (let i = 0; i < mention_array.length; i++) {
    const current_mention = mention_array[i];
    const { display, index, plainTextIndex } = current_mention;
    const mention_offset = index - plainTextIndex;

    console.log(i, current_mention);

    if (cursor_plain_text_index <= plainTextIndex) {
      // Cursor is in front of this mention. ie. " asdfas |@jim" where | is the cursor
      index_offset = mention_offset;
      break;
    } else if (cursor_plain_text_index >= plainTextIndex + display.length) {
      if (i == mention_array.length - 1) {
        // Cursor is after last mention.
        // Manually compute the expected offset.
        index_offset = mention_offset + SINGLE_MENTION_OFFSET;
      }
    } else if (cursor_plain_text_index > plainTextIndex + display.length / 2) {
      usuable_cursor_index = plainTextIndex + display.length;
      if (i == mention_array.length - 1) {
        // Cursor is after last mention.
        // Manually compute the expected offset.
        index_offset = mention_offset + SINGLE_MENTION_OFFSET;
      }
    } else if (cursor_plain_text_index <= plainTextIndex + display.length / 2) {
      usuable_cursor_index = plainTextIndex;
      index_offset = mention_offset;
      break;
    }
  }
  return index_offset + usuable_cursor_index;
}
