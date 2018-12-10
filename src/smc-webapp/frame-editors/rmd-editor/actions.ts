/*
R Markdown Editor Actions
*/

import { Set } from "immutable";
import { callback } from "awaiting";
import { debounce } from "lodash";
import { Actions } from "../markdown-editor/actions";
import { convert } from "./rmd-converter";
import { markdown_to_html_frontmatter } from "../../markdown";
import { FrameTree } from "../frame-tree/types";
import { redux } from "../../app-framework";
import { change_filename_extension, path_split } from "smc-util/misc2";

export class RmdActions extends Actions {
  private _last_save_time: number = 0;

  _init2(): void {
    super._init2(); // that's the one in markdown-editor/actions.ts
    if (!this.is_public) {
      // one extra thing after markdown.
      this._init_rmd_converter();
      this._check_produced_files();
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

  async _check_produced_files(): Promise<void> {
    const project_actions = redux.getProjectActions(this.project_id);
    if (project_actions == undefined) {
      return;
    }
    const path = path_split(this.path).head;
    const update_dir = (path, cb) => {
      project_actions.fetch_directory_listing({ finish_cb: cb, path: path });
    };
    await callback(update_dir, path);

    const project_store = project_actions.get_store();
    if (project_store == undefined) {
      return;
    }
    const dir_listings = project_store.get("directory_listings");
    if (dir_listings == undefined) {
      return;
    }
    const listing = dir_listings.get(path);
    if (listing == undefined) {
      return;
    }

    let existing = Set();
    for (let ext of ["pdf", "html", "nb.html"]) {
      // full path
      const expected_fn = change_filename_extension(this.path, ext);
      const fn_exists = listing.some(entry => {
        const name = entry.get("name");
        return name === path_split(expected_fn).tail;
      });
      if (fn_exists) {
        existing = existing.add(ext);
      }
    }

    // console.log("setting derived_file_types to", existing.toJS());
    this.setState({
      derived_file_types: existing
    });
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
      await this._check_produced_files();
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
