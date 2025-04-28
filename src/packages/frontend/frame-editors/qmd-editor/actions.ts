/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Quarto Editor Actions
*/

import { Set } from "immutable";
import { debounce } from "lodash";

import { redux } from "@cocalc/frontend/app-framework";
import { markdown_to_html_frontmatter } from "@cocalc/frontend/markdown";
import { path_split } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import {
  Actions as BaseActions,
  CodeEditorState,
} from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";
import { ExecOutput } from "../generic/client";
import { Actions as MarkdownActions } from "../markdown-editor/actions";
import { derive_rmd_output_filename } from "../rmd-editor/utils";
import { convert } from "./qmd-converter";

const custom_pdf_error_message: string = `
No PDF file has been generated.
`;

const MINIMAL = `---
title: "Title"
---

## Test

Example plot

\`\`\`{r}
plot(rnorm(100))
\`\`\`
`;

export class Actions extends MarkdownActions {
  private _last_qmd_hash: number | undefined = undefined;
  private is_building: boolean = false;
  private run_qmd_converter: Function;

  _init2(): void {
    super._init2(); // that's the one in markdown-editor/actions.ts
    if (!this.is_public) {
      // one extra thing after markdown.
      this._syncstring.once("ready", this._init_qmd_converter.bind(this));
      this._check_produced_files();
      this.setState({ custom_pdf_error_message });
      this._syncstring.on(
        "change",
        debounce(this.ensureNonempty.bind(this), 1500),
      );
    }
  }

  private do_build_on_save(): boolean {
    const account: any = this.redux.getStore("account");
    if (account != null) {
      return !!account.getIn(["editor_settings", "build_on_save"]);
    }
    return true;
  }

  _init_qmd_converter(): void {
    // one build takes min. a few seconds up to a minute or more
    this.run_qmd_converter = debounce(
      async (hash?) => await this._run_qmd_converter(hash),
      5 * 1000,
      { leading: true, trailing: false },
    );

    const do_build = reuseInFlight(async () => {
      if (!this.do_build_on_save()) return;
      if (this._syncstring == null) return;
      const hash = this._syncstring.hash_of_saved_version();
      if (this._last_qmd_hash != hash) {
        this._last_qmd_hash = hash;
        await this.run_qmd_converter();
      }
    });

    this._syncstring.on("save-to-disk", do_build);
    this._syncstring.on("after-change", do_build);
    this.run_qmd_converter();
  }

  async build(id?: string): Promise<void> {
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
      await this.run_qmd_converter(Date.now());
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
    await project_actions.fetch_directory_listing({ path });

    const project_store = project_actions.get_store();
    if (project_store == undefined) {
      return;
    }
    // TODO: change the 0 to the compute server when/if we ever support QMD on a compute server (which we don't)
    const dir_listings = project_store.getIn(["directory_listings", 0]);
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
      derived_file_types: existing as any,
    });
  }

  private set_log(output?: ExecOutput | undefined): void {
    this.setState({
      build_err: output?.stderr.trim(),
      build_log: output?.stdout.trim(),
      build_exit: output?.exit_code,
    });
  }

  // use this.run_qmd_converter
  private async _run_qmd_converter(hash?): Promise<void> {
    // TODO: should only run knitr if at least one frame is visible showing preview?
    // maybe not, since might want to show error.
    if (this._syncstring == null || this._syncstring.get_state() != "ready") {
      // do not run if not ready -- important due to the debounce, which could
      // fire this at any time.
      return;
    }
    if (this._last_qmd_hash == null) {
      this._last_qmd_hash = this._syncstring.hash_of_saved_version();
    }
    const md = this._syncstring.to_str();
    if (md == null) return;
    this.set_status("Running Quarto...");
    this.setState({ building: true });
    this.set_error("");
    this.setState({ build_log: "", build_err: "" });
    let markdown = "";
    let output: ExecOutput | undefined = undefined;
    try {
      const { frontmatter, html } = markdown_to_html_frontmatter(md);
      markdown = html;
      output = await convert({
        project_id: this.project_id,
        path: this.path,
        frontmatter,
        hash: hash || this._last_qmd_hash,
      });
      this.set_log(output);
      if (output == null || output.exit_code != 0) {
        this.set_error(
          "Error compiling file using Quarto. Please check the Build Log!",
        );
      } else {
        this.reload();
        await this._check_produced_files();
      }
    } catch (err) {
      this.set_error(err, "monospace");
      this.set_log(output);
      return;
    } finally {
      this.set_status("");
      this.setState({ building: false });
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
    hash = hash || Date.now();
    ["iframe", "pdfjs_canvas", "markdown"].forEach((viewer) =>
      this.set_reload(viewer, hash),
    );
  }

  // Never delete trailing whitespace for markdown files.
  delete_trailing_whitespace(): void {}

  private ensureNonempty() {
    if (this.store && !this.store.get("value")?.trim()) {
      this.set_value(MINIMAL);
      this.build();
    }
  }
}
