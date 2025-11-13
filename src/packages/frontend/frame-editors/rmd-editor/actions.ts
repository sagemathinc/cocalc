/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
R Markdown Editor Actions
*/

// cSpell:ignore rnorm

import { Set } from "immutable";
import { debounce } from "lodash";

import { redux } from "@cocalc/frontend/app-framework";
import { markdown_to_html_frontmatter } from "@cocalc/frontend/markdown";
import { open_new_tab } from "@cocalc/frontend/misc";
import { path_split } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import {
  Actions as BaseActions,
  CodeEditorState,
} from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";
import { exec, ExecOutput } from "../generic/client";
import { ExecuteCodeOutputAsync } from "@cocalc/util/types/execute-code";
import { Actions as MarkdownActions } from "../markdown-editor/actions";
import { convert } from "./rmd-converter";
import { derive_rmd_output_filename } from "./utils";
const HELP_URL = "https://doc.cocalc.com/frame-editor.html#edit-rmd";

const MINIMAL = `---
title: "Title"
output:
  html_document:
    toc: true
---

## Title

\`\`\`{r}
summary(rnorm(100))
\`\`\`
`;

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

export class Actions extends MarkdownActions {
  private _last_rmd_hash: number | undefined = undefined;
  private is_building: boolean = false;
  public run_rmd_converter: Function;

  _init2(): void {
    super._init2(); // that's the one in markdown-editor/actions.ts
    this.build = this.build.bind(this);
    // one extra thing after markdown.
    this._syncstring.once("ready", () => {
      this._init_rmd_converter();
    });
    this._check_produced_files();
    this.setState({ custom_pdf_error_message });
    this._syncstring.on(
      "change",
      debounce(this.ensureNonempty.bind(this), 1500),
    );
  }

  private do_build_on_save(): boolean {
    const account: any = this.redux.getStore("account");
    if (account != null) {
      return !!account.getIn(["editor_settings", "build_on_save"]);
    }
    return true;
  }

  _init_rmd_converter(): void {
    // one build takes min. a few seconds up to a minute or more
    this.run_rmd_converter = debounce(
      async (hash?: number) => await this._run_rmd_converter(hash),
      5 * 1000,
      { leading: true, trailing: false },
    );

    const do_build = reuseInFlight(async () => {
      if (!this.do_build_on_save()) return;
      if (this._syncstring == null) return;
      const hash = this._syncstring.hash_of_saved_version();
      if (this._last_rmd_hash != hash) {
        this._last_rmd_hash = hash;
        await this.run_rmd_converter(hash);
      }
    });

    this._syncstring.on("save-to-disk", do_build);
    this._syncstring.on("after-change", do_build);
    // Initial run with current hash if available
    const initial_hash = this._syncstring.hash_of_saved_version();
    this.run_rmd_converter(initial_hash);
  }

  async build(id?: string, force: boolean = false): Promise<void> {
    if (id) {
      const cm = this._get_cm(id);
      if (cm) {
        cm.focus();
      }
    }
    // initiating a build. if one is running & forced, we stop the build
    if (this.is_building) {
      if (force) {
        await this.stop_build("");
      } else {
        return;
      }
    }
    this.is_building = true;
    try {
      const actions = this.redux.getEditorActions(this.project_id, this.path);
      if (actions == null) {
        // opening/close a newly created file can trigger build when actions aren't
        // ready yet.  https://github.com/sagemathinc/cocalc/issues/7249
        return;
      }
      await (actions as BaseActions<CodeEditorState>).save(false);
      // For force builds, bypass the debounced function to ensure immediate execution
      if (force) {
        await this._run_rmd_converter(Date.now());
      } else {
        await this.run_rmd_converter(Date.now());
      }
    } finally {
      this.is_building = false;
    }
  }

  // supports the "Force Rebuild" button.
  async force_build(id: string): Promise<void> {
    await this.build(id, true);
  }

  // This stops the current RMD build process and resets the state.
  async stop_build(_id: string): Promise<void> {
    const job_info = this.store.get("job_info")?.toJS() as
      | ExecuteCodeOutputAsync
      | undefined;

    if (
      job_info &&
      job_info.type === "async" &&
      job_info.status === "running" &&
      typeof job_info.pid === "number"
    ) {
      try {
        // Kill the process using the same approach as LaTeX editor
        await exec(
          {
            project_id: this.project_id,
            // negative PID, to kill the entire process group
            command: `kill -9 -${job_info.pid}`,
            // bash:true is necessary. kill + array does not work.
            bash: true,
            err_on_exit: false,
          },
          this.path,
        );
      } catch (err) {
        // likely "No such process", we just ignore it
      } finally {
        // Update the job status to killed
        const updated_job_info: ExecuteCodeOutputAsync = {
          ...job_info,
          status: "killed",
        };
        this.setState({ job_info: updated_job_info });
      }
    }
    this.set_status("");
    this.setState({ building: false });
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
    // TODO: change the 0 to the compute server when/if we ever support RMD on a compute server (which we don't)
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
      build_err: output?.stderr?.trim(),
      build_log: output?.stdout?.trim(),
      build_exit: output?.exit_code,
      job_info: output?.type === "async" ? output : undefined,
    });
  }

  private set_job_info(job_info: ExecuteCodeOutputAsync): void {
    if (!job_info) return;
    this.setState({
      build_log: job_info.stdout?.trim() ?? "",
      build_err: job_info.stderr?.trim() ?? "",
      build_exit: job_info.exit_code,
      job_info,
    });
  }

  // use this.run_rmd_converter
  private async _run_rmd_converter(hash?): Promise<void> {
    // TODO: should only run knitr if at least one frame is visible showing preview?
    // maybe not, since might want to show error.
    if (this._syncstring == null || this._syncstring.get_state() != "ready") {
      // do not run if not ready -- important due to the debounce, which could
      // fire this at any time.
      return;
    }
    if (this._last_rmd_hash == null) {
      this._last_rmd_hash = this._syncstring.hash_of_saved_version();
    }
    const md = this._syncstring.to_str();
    if (md == null) return;
    this.set_status("Running RMarkdown...");
    this.setState({ building: true });
    this.set_error("");
    this.setState({ build_log: "", build_err: "" });
    let markdown = "";
    let output: ExecOutput | undefined = undefined;
    try {
      const { frontmatter, html } = markdown_to_html_frontmatter(md);
      markdown = html;
      output = await convert(
        this.project_id,
        this.path,
        frontmatter,
        hash || this._last_rmd_hash || Date.now(),
        this.set_job_info.bind(this),
      );
      this.set_log(output);
      if (output == null || output.exit_code != 0) {
        this.set_error(
          "Error compiling RMarkdown. Please check the Build Log!",
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

  help(): void {
    open_new_tab(HELP_URL);
  }

  private ensureNonempty() {
    if (this.store && !this.store.get("value")?.trim()) {
      this.set_value(MINIMAL);
      this.build();
    }
  }
}
