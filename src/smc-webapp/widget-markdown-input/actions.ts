// 3rd Party Libraries

// Internal Libraries
import { Actions, redux } from "../app-framework";

// Sibling Libraries
import * as info from "./info";
import { MarkdownWidgetStoreState, MarkdownWidgetStore } from "./store";

export class MarkdownWidgetActions extends Actions<MarkdownWidgetStoreState> {
  get_store(): MarkdownWidgetStore {
    return redux.getStore(info.name) as any;
  }

  clear = id => {
    if (id == undefined) {
      return;
    }
    const open_inputs = this.get_store()
      .get("open_inputs")
      .delete(id);
    this.setState({ open_inputs });
  };

  set_value = (id, value) => {
    if (id == undefined) {
      return;
    }
    const open_inputs = this.get_store()
      .get("open_inputs")
      .set(id, value);
    this.setState({ open_inputs });
  };
}
