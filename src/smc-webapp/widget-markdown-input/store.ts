// 3rd Party Libraries
import * as immutable from "immutable";

// Internal Libraries
import { Store } from "../smc-react/Store";

interface markdownWidgetState {
  open_inputs: immutable.Map<string, string>;
}

class store extends Store<markdownWidgetState> {
  getInitialState() {
    return {
      open_inputs: immutable.Map({})
    };
  }
}

export = { store };