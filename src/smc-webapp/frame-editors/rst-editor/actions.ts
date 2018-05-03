/*
Rst Editor Actions
*/

const CodeEditorActions = require("../code-editor/actions").Actions;
import { print_html } from "../frame-tree/print";
import { convert } from "./rst2html";
import { raw_url, aux_file } from "../frame-tree/util";

import { FrameTree } from "../frame-tree/types";

export class Actions extends CodeEditorActions {
  _init(...args): void {
    super._init(...args); // call the _init for the parent class
    if (!this.is_public) {
      this._init_syncstring_value();
      this._init_spellcheck(); // TODO: need to "detex" (?)
      this._init_rst2html();
    } else {
      this._init_content();
    }
  }

  _init_rst2html(): void {
    this._syncstring.on("save-to-disk", () => this._run_rst2html());
    this._run_rst2html();
  }

  _run_rst2html(time?: number): void {
    this.set_status("Running rst2html...");
    convert({
      path: this.path,
      project_id: this.project_id,
      time,
      cb: err => {
        this.set_status("");
        if (err) {
          this.set_error(err);
        } else {
          this.set_reload("rst");
        }
      }
    });
  }

  _raw_default_frame_tree() : FrameTree {
    if (this.is_public) {
      return { type: "cm" };
    } else {
      return {
        direction: "col",
        type: "node",
        first: {
          type: "cm"
        },
        second: {
          type: "rst"
        }
      };
    }
  }

  print(id: string): void {
    const node = this._get_frame_node(id);
    const type = node.get("type");
    if (type === "cm") {
      super.print(id);
      return;
    }
    if (type !== "rst") {
      // no other types support printing
      this.set_error("printing of #{type} not implemented");
      return;
    }

    const err = print_html({
      src: raw_url(this.project_id, aux_file(this.path, "html"))
    });
    if (err) {
      this.set_error(err);
    }
  }
}
