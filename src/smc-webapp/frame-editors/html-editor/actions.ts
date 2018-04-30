/*
HTML Editor Actions
*/

import * as $ from "jquery";

import {Map} from "immutable";

//import { Actions as CodeEditorActions } from "../code-editor/actions";
const CodeEditorActions = require("../code-editor/actions").Actions;

import { print_html, print_url } from "../frame-tree/print";

import { FrameTree } from "../frame-tree/types";

import {raw_url} from "../frame-tree/util";


export class Actions extends CodeEditorActions {
  _init(...args): void {
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

  _raw_default_frame_tree(): FrameTree {
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
    const node : Map<string,any> = this._get_frame_node(id);
    if (node.get("type") === "cm") {
      super.print(id);
      return;
    }

    let err: string = "";
    switch (node.get("type")) {
      case "iframe":
        err = print_url(raw_url(this.project_id, this.path));
        break;
      case "preview":
        err = print_html({
          html: $(`#frame-${id}`).html(),
          project_id: this.project_id,
          path: this.path,
          font_size: node.get("font_size")
        });
        break;
      default:
        err = "Printing not implemented";
    }

    if (err) {
      this.set_error(err);
    }
  }
}
