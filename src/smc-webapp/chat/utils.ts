import { MentionList } from "./store";

import { USER_MENTION_MARKUP_WITHOUT_PLACEHOLDERS } from "./input";

const SINGLE_MENTION_OFFSET =
  USER_MENTION_MARKUP_WITHOUT_PLACEHOLDERS.length + 36;

// TODO: Cover highlight and replace case
export function compute_cursor_offset(
  cursor_plain_text_index: number,
  mentions: MentionList
) {
  console.log("BEGIN Computing offset with index at", cursor_plain_text_index);
  let index_offset = 0;
  let usuable_cursor_index = cursor_plain_text_index;
  const mention_array = mentions.toJS();

  console.log("Our mentions are:", mention_array);

  for (let i = 0; i < mention_array.length; i++) {
    const current_mention = mention_array[i];
    const { display, index, plainTextIndex } = current_mention;
    const mention_offset = index - plainTextIndex;

    console.log(i, current_mention);

    if (cursor_plain_text_index <= plainTextIndex) {
      // Cursor is in front of this mention. ie. " asdfas |@jim" where | is the cursor
      index_offset = mention_offset;
      console.log("Cursor is in front of this mention", index_offset);
      break;
    } else if (cursor_plain_text_index >= plainTextIndex + display.length) {
      console.log("Cursor is behind this mention, do nothing");
      if (i == mention_array.length - 1) {
        // Cursor is after last mention.
        // Manually compute the expected offset.
        index_offset = mention_offset + SINGLE_MENTION_OFFSET;
        console.log("Cursor is behind last mention", index_offset);
      }
    } else if (cursor_plain_text_index > plainTextIndex + display.length / 2) {
      usuable_cursor_index = plainTextIndex + display.length;
      if (i == mention_array.length - 1) {
        // Cursor is after last mention.
        // Manually compute the expected offset.
        index_offset = mention_offset + SINGLE_MENTION_OFFSET;
        console.log("Cursor is behind last mention", index_offset);
      }
    } else if (cursor_plain_text_index <= plainTextIndex + display.length / 2) {
      usuable_cursor_index = plainTextIndex;
      index_offset = mention_offset;
      console.log("Cursor is inside first half of some mention", index_offset);
      break;
    }
  }
  console.log(
    "END",
    usuable_cursor_index,
    "+",
    index_offset,
    "=",
    index_offset + usuable_cursor_index
  );
  return index_offset + usuable_cursor_index;
}
