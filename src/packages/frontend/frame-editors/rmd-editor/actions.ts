/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
R Markdown Editor Actions
*/

import { debounce } from "lodash";
import { markdown_to_html_frontmatter } from "@cocalc/frontend/markdown";
import { open_new_tab } from "@cocalc/frontend/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import {
  Actions as BaseActions,
  CodeEditorState,
} from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";
import { ExecOutput } from "../generic/client";
import { Actions as MarkdownActions } from "../markdown-editor/actions";
import { convert } from "./rmd-converter";
import { checkProducedFiles } from "./utils";
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
        await this.run_rmd_converter();
      }
    });

    this._syncstring.on("save-to-disk", do_build);
    this._syncstring.on("after-change", do_build);
    this.run_rmd_converter();
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
      if (actions == null) {
        // opening/close a newly created file can trigger build when actions aren't
        // ready yet.  https://github.com/sagemathinc/cocalc/issues/7249
        return;
      }
      await (actions as BaseActions<CodeEditorState>).save(false);
      await this.run_rmd_converter(Date.now());
    } finally {
      this.is_building = false;
    }
  }

  async _check_produced_files(): Promise<void> {
    await checkProducedFiles(this);
  }

  private set_log(output?: ExecOutput | undefined): void {
    this.setState({
      build_err: output?.stderr.trim(),
      build_log: output?.stdout.trim(),
      build_exit: output?.exit_code,
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
        hash || this._last_rmd_hash,
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
