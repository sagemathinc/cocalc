/*
HTML Editor Actions
*/

import * as $ from "jquery";

//import { Actions as CodeEditorActions } from "../code-editor/actions";
const CodeEditorActions = require("../code-editor/actions").Actions;

//import { print_html } from "./print";
const { print_html } = require("./print.ts");

export class Actions extends CodeEditorActions {
  _init(...args) : void {
    super._init(...args); // call the _init for the parent class
    if (!this.is_public) {
      this._init_syncstring_value();
      this._init_spellcheck();
      this._init_iframe_reload();
    }
  }

  _init_iframe_reload(): void {
    this._syncstring.on("save-to-disk", () => {
      this.set_reload("iframe");
    });
  }

  _raw_default_frame_tree() {
    if (this.is_public) {
      return { type: "html" };
    } else {
      return {
        direction: "col",
        type: "node",
        first: {
          type: "cm"
        },
        second: {
          type: "iframe"
        }
      };
    }
  }

  print(id: string): void {
    let src, value;
    const node = this._get_frame_node(id);
    if (node.get("type") === "cm") {
      super.print(id);
      return;
    }

    let html : string | undefined = (value = src = undefined);

    if (node.get("type") === "iframe") {
      src = `${window.app_base_url}/${this.project_id}/raw/${this.path}`;
    } else {
      const elt = $(`#frame-${id}`); // see remark in markdown actions, which is similar
      if (elt.length === 1) {
        // in case there were two (impossible) we don't do this and fall back to directly computing the html.
        html = elt.html();
      } else {
        value = this.store.get("value");
      }
    }

    const error = print_html({
      value,
      html,
      src,
      project_id: this.project_id,
      path: this.path,
      font_size: node.get("font_size")
    });
    if (error) {
      this.setState({ error });
    }
  }
}
