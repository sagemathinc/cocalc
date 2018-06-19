// 3rd Party Libraries
import * as immutable from "immutable";

// Internal Libraries
import { Store } from "../smc-react/Store";

interface chatState {
  height: number; // 0 means not rendered; otherwise is the height of the chat editor
  input: string; // content of the input box
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
}

class store extends Store<chatState> {
  getInitialState() {
    return {
      height: 0,
      input: "",
      is_preview: undefined,
      last_sent: undefined,
      messages: undefined,
      offset: undefined,
      position: undefined,
      saved_mesg: undefined,
      use_saved_position: undefined,
      saved_position: undefined,
      search: "",
      add_collab: false
    };
  }
}

export = { store };
