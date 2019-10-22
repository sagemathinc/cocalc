/*
HTML Editor Actions
*/

import * as $ from "jquery";
import { Actions as CodeEditorActions } from "../code-editor/actions";
import { print_html } from "../frame-tree/print";
import { FrameTree } from "../frame-tree/types";
import { raw_url } from "../frame-tree/util";

export class Actions extends CodeEditorActions {
  _init2(): void {
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

  // https://github.com/sagemathinc/cocalc/issues/3984
  reload(id: string) {
    const node = this._get_frame_node(id);
    if (!node) return;

    if (node.get("type") !== "iframe") {
      super.reload(id);
      return;
    }

    this.set_reload("iframe");
  }

  print(id: string): void {
    const node = this._get_frame_node(id);
    if (!node) return;

    if (node.get("type") === "cm") {
      super.print(id);
      return;
    }

    try {
      switch (node.get("type")) {
        case "iframe":
          print_html({ src: raw_url(this.project_id, this.path) });
          break;
        case "preview":
          print_html({
            html: $(`#frame-${id}`).html(),
            project_id: this.project_id,
            path: this.path
          });
          break;
        default:
          throw Error("Printing not implemented");
      }
    } catch (err) {
      this.set_error(err);
    }
  }
}
