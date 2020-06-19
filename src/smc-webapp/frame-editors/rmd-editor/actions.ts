/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
R Markdown Editor Actions
*/

import { Set } from "immutable";
import { debounce } from "lodash";
import { callback2 } from "smc-util/async-utils";
import { Actions } from "../markdown-editor/actions";
import { convert } from "./rmd-converter";
import { markdown_to_html_frontmatter } from "../../markdown";
import { FrameTree } from "../frame-tree/types";
import { redux } from "../../app-framework";
import { path_split } from "smc-util/misc2";
import { derive_rmd_output_filename } from "./utils";
import {
  Actions as BaseActions,
  CodeEditorState,
} from "../code-editor/actions";

const custom_pdf_error_message: string = `
To create a PDF document from R Markdown, you specify the \`pdf_document\` output format in the
YAML metadata by putting this code at the top of your file:

\`\`\`
---
title: "My Document"
author: CoCalc User
date: Sept 27, 2019
output: pdf_document
---
\`\`\`

Within a document that generates PDF output, you can use raw LaTeX, and even define LaTeX macros.

Once you make the above change, the HTML output will no longer be updated.  If you would
like to switch back to HTML output, delete the output line or replace it with
\`\`\`
output: html_document
\`\`\`
`;

export class RmdActions extends Actions {
  private _last_save_time: number = 0;
  private is_building: boolean = false;
  private run_rmd_converter: Function;

  _init2(): void {
    super._init2(); // that's the one in markdown-editor/actions.ts
    if (!this.is_public) {
      // one extra thing after markdown.
      this._init_rmd_converter();
      this._check_produced_files();
      this.setState({ custom_pdf_error_message });
    }
  }

  _init_rmd_converter(): void {
    this.run_rmd_converter = debounce(
      (time?: number) => this._run_rmd_converter(time),
      5 * 1000,
      {
        leading: true,
        trailing: true,
      }
    );
    this._syncstring.on("save-to-disk", (time) => {
      this._last_save_time = time;
      this.run_rmd_converter();
    });
    this._syncstring.once("ready", () => this._run_rmd_converter());
  }

  async build(id: string): Promise<void> {
    console.log("build", id);
    if (id) {
      const cm = this._get_cm(id);
      if (cm) {
        cm.focus();
      }
    }
    if (this.is_building) {
      return;
    }
    this.is_building = true;
    try {
      const actions = this.redux.getEditorActions(this.project_id, this.path);
      await (actions as BaseActions<CodeEditorState>).save(false);
      // we don't use this._last_save_time but instead a new timestamp
      await this.run_rmd_converter(new Date().valueOf());
    } finally {
      this.is_building = false;
    }
  }

  async _check_produced_files(): Promise<void> {
    const project_actions = redux.getProjectActions(this.project_id);
    if (project_actions == undefined) {
      return;
    }
    const path = path_split(this.path).head;
    await callback2(project_actions.fetch_directory_listing, { path });

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
    for (const ext of ["pdf", "html", "nb.html"]) {
      // full path – basename might change
      const expected_fn = derive_rmd_output_filename(this.path, ext);
      const fn_exists = listing.some((entry) => {
        const name = entry.get("name");
        return name === path_split(expected_fn).tail;
      });
      if (fn_exists) {
        existing = existing.add(ext);
      }
    }

    // console.log("setting derived_file_types to", existing.toJS());
    this.setState({
      derived_file_types: existing,
    });
  }

  async _run_rmd_converter(time?: number): Promise<void> {
    // TODO: should only run knitr if at least one frame is visible showing preview?
    // maybe not, since might want to show error.
    if (this._syncstring == null || this._syncstring.get_state() != "ready") {
      // do not run if not ready -- important due to the debounce, which could
      // fire this at any time.
      return;
    }
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
      this.reload();
      await this._check_produced_files();
    } catch (err) {
      this.set_error(err, "monospace");
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
          type: "cm",
        },
        second: {
          type: "node",
          direction: "row",
          first: { type: "iframe" },
          second: { type: "build" },
          pos: 0.8,
        },
      };
    }
  }

  reload(_id?: string, hash?: number) {
    // what is id supposed to be used for?
    // the html editor, which also has an iframe, calls somehow super.reload
    hash = hash || new Date().getTime();
    ["iframe", "pdfjs_canvas", "markdown"].forEach((viewer) =>
      this.set_reload(viewer, hash)
    );
  }

  // Never delete trailing whitespace for markdown files.
  delete_trailing_whitespace(): void {}
}
