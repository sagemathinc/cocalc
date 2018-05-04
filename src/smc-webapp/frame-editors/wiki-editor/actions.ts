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

  _init_wiki2html(): void {
    this._syncstring.on("save-to-disk", () => this._run_wiki2html());
    this._run_wiki2html();
  }

  async _run_wiki2html(time?: number): Promise<void> {
    this.set_status("Converting wiki to html (using pandoc)...");
    try {
      await convert(this.project_id, this.path, time);
      this.set_reload("html");
    } catch (err) {
      this.set_error(err);
    } finally {
      this.set_status("");
    }
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
