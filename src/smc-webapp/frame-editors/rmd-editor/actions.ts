/*
R Markdown Editor Actions
*/

import { debounce } from "lodash";
import { Actions } from "../markdown-editor/actions";
import { convert } from "./rmd2md";
import { markdown_to_html_frontmatter } from "../../markdown";
import { FrameTree } from "../frame-tree/types";

export class RmdActions extends Actions {
  _init2(): void {
    if (!this.is_public) {
      // one extra thing after markdown.
      this._init_rmd2md();
    }
  }

  _init_rmd2md(): void {
    const run_debounced = debounce(() => this._run_rmd2md(), 10 * 1000, {
      leading: true,
      trailing: true
    });
    this._syncstring.on("save-to-disk", run_debounced);
    this._run_rmd2md();
  }

  async _run_rmd2md(time?: number): Promise<void> {
    // TODO: should only run knitr if at least one frame is visible showing preview?
    // maybe not, since might want to show error.
    this.set_status("Running RMarkdown...");
    this.set_error("");
    try {
      const md: string = this._syncstring.to_str();
      let frontmatter: string;
      if (md !== undefined) {
        frontmatter = markdown_to_html_frontmatter(md).frontmatter;
      } else {
        frontmatter = "";
      }
      await convert(this.project_id, this.path, frontmatter, time);
      this.set_reload("iframe");
      this.set_reload("pdfjs_canvas");
    } catch (err) {
      this.set_error(err);
      return;
    } finally {
      this.set_status("");
    }
    // this.setState({ value: markdown });
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
          type: "iframe"
        }
      };
    }
  }
}
