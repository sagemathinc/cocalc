/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Media wiki Editor Actions
*/

import { Actions as MarkdownActions } from "../markdown-editor/actions";
import { convert } from "./wiki2html";

import { FrameTree } from "../frame-tree/types";

export class Actions extends MarkdownActions {
  _init(...args) {
    super._init(...args); // call the _init for the parent class
    if (!this.is_public) {
      // one extra thing after base class init...
      this._init_wiki2html();
    }
  }

  _init_wiki2html() {
    this._syncstring.on("save-to-disk", () => this._run_wiki2html());
    return this._run_wiki2html();
  }

  _run_wiki2html(time?: number): void {
    // TODO: only run if at least one frame is visible showing preview (otherwise, we just waste cpu)
    this.set_status("Running pandoc...");
    convert({
      path: this.path,
      project_id: this.project_id,
      time,
      cb: (err, html_path) => {
        this.set_status("");
        if (err) {
          this.set_error(err);
        } else {
          this.set_reload("html");
        }
      }
    });
  }

  _raw_default_frame_tree(): FrameTree {
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
          type: "html"
        }
      };
    }
  }
}
