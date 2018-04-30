/*
Markdown Editor Actions
*/

import * as $ from "jquery";

const CodeEditorActions = require("../code-editor/actions").Actions;

const { toggle_checkbox } = require("smc-webapp/tasks/desc-rendering");
const { print_html } = require("../frame-tree/print");

import { FrameTree } from "../frame-tree/types";

export class Actions extends CodeEditorActions {
  _init(...args): void {
    super._init(...args); // call the _init for the parent class
    if (!this.is_public) {
      this._init_syncstring_value();
      this._init_spellcheck();
    }
  }

  _raw_default_frame_tree() : FrameTree {
    if (this.is_public) {
      return { type: "markdown" };
    } else {
      return {
        direction: "col",
        type: "node",
        first: {
          type: "cm"
        },
        second: {
          type: "markdown"
        }
      };
    }
  }

  toggle_markdown_checkbox(id : string, index : number, checked : boolean): void {
    // Ensure that an editor state is saved into the
    // (TODO: make more generic, since other editors will exist that are not just codemirror...)
    this.set_syncstring_to_codemirror(id);
    // Then do the checkbox toggle.
    const value = toggle_checkbox(this._syncstring.to_str(), index, checked);
    this._syncstring.from_str(value);
    this.set_codemirror_to_syncstring();
    this._syncstring.save();
    this.setState({ value });
  }

  print(id: string): void {
    const node = this._get_frame_node(id);
    if (!node) return;
    if (node.get("type") === "cm") {
      super.print(id);
      return;
    }

    // This is kind of hackish, but it works really well.
    // The one issue would be if the same random 8-letter id happened
    // to be used twice in the same session. This is impossible right now,
    // since only one markdown viewer is in the DOM at once.
    const err = print_html({
      html : $(`#frame-${id}`).html(),
      project_id: this.project_id,
      path: this.path,
      font_size: node.get("font_size")
    });
    if (err) {
      this.set_error(err);
    }
  }
}
