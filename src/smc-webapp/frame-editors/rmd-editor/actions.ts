/*
R Markdown Editor Actions
*/

import { debounce } from "lodash";
import { Actions } from "../markdown-editor/actions";
import { convert } from "./rmd-converter";
import { markdown_to_html_frontmatter } from "../../markdown";
import { FrameTree } from "../frame-tree/types";

export class RmdActions extends Actions {
  private _last_save_time: number = 0;

  _init2(): void {
    if (!this.is_public) {
      // one extra thing after markdown.
      this._init_rmd_converter();
    }
  }

  _init_rmd_converter(): void {
    const run_debounced = debounce(() => this._run_rmd_converter(), 5 * 1000, {
      leading: true,
      trailing: true
    });
    this._syncstring.on("save-to-disk", time => {
      this._last_save_time = time;
      run_debounced();
    });
    this._syncstring.once("init", () => this._run_rmd_converter());
  }

  async _run_rmd_converter(time?: number): Promise<void> {
    // TODO: should only run knitr if at least one frame is visible showing preview?
    // maybe not, since might want to show error.
    this.set_status("Running RMarkdown...");
    this.set_error("");
    let markdown = "";
    try {
      const md: string = this._syncstring.to_str();
      let frontmatter = "";
      if (md !== undefined) {
        const md2html = markdown_to_html_frontmatter(md);
        frontmatter = md2html.frontmatter;
        markdown = md2html.html;
      } else {
        return;
      }
      await convert(
        this.project_id,
        this.path,
        frontmatter,
        time || this._last_save_time
      );
      this.set_reload("iframe");
      this.set_reload("pdfjs_canvas");
    } catch (err) {
      this.set_error(err);
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
          type: "iframe"
        }
      };
    }
  }
}
