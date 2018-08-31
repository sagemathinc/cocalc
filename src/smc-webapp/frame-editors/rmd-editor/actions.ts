/*
R Markdown Editor Actions
*/

import { Actions } from "../markdown-editor/actions";
import { convert } from "./rmd2md";
import { FrameTree } from "../frame-tree/types";

export class RmdActions extends Actions {
  _init2(): void {
    if (!this.is_public) {
      // one extra thing after markdown.
      this._init_rmd2md();
    }
  }

  _init_rmd2md(): void {
    this._syncstring.on("save-to-disk", () => this._run_rmd2md());
    this._run_rmd2md();
  }

  async _run_rmd2md(time?: number): Promise<void> {
    // TODO: should only run knitr if at least one frame is visible showing preview?
    // maybe not, since might want to show error.
    this.set_status("Running knitr...");
    this.set_error('');
    let markdown: string;
    try {
      markdown = await convert(this.project_id, this.path, time);
    } catch (err) {
      this.set_error(err);
      this.setState({ value: 'Error processing RMarkdown.'})
      return;
    } finally {
      this.set_status("");
    }
    this.setState({ value: markdown });
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
          type: "markdown"
        }
      };
    }
  }
}
