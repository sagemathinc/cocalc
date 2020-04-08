// 3rd Party Libraries
import * as immutable from "immutable";

// Internal Libraries
import { Store } from "../app-framework/Store";

export type MentionList = immutable.List<{
  id: string;
  display: string;
  type?: string;
  index: number;
  plainTextIndex: number;
}>;

interface ChatState {
  height: number; // 0 means not rendered; otherwise is the height of the chat editor
  input: string; // content of the input box
  message_plain_text: string; // What the user sees in the chat box eg. stripped of internal mention markup
  is_preview?: boolean; // currently displaying preview of the main input chat
  last_sent?: string; // last sent message
  messages?: immutable.Map<any, any>;
  offset?: number; // information about where on screen the chat editor is located
  position?: number; // more info about where chat editor is located
  saved_mesg?: string; // The message state before saving and edited message. Potentially broken with mutiple edits
  use_saved_position?: boolean; //   whether or not to maintain last saved scroll position (used when unmounting then remounting, e.g., due to tab change)
  saved_position?: number;
  search: string;
  add_collab: boolean;
  is_saving: boolean;
  has_uncommitted_changes: boolean;
  has_unsaved_changes: boolean;
  unsent_user_mentions: MentionList;
}

export class ChatStore extends Store<ChatState> {
  getInitialState = function () {
    return {
      height: 0,
      input: "",
      message_plain_text: "",
      is_preview: undefined,
      last_sent: undefined,
      messages: undefined,
      offset: undefined,
      position: undefined,
      saved_mesg: undefined,
      use_saved_position: undefined,
      saved_position: undefined,
      search: "",
      add_collab: true,
      is_saving: false,
      has_uncommitted_changes: false,
      has_unsaved_changes: false,
      unsent_user_mentions: immutable.List(),
    };
  };
}
