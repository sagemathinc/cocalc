/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Quarto Editor Actions
*/

// cSpell:ignore rnorm

import { debounce } from "lodash";

import { markdown_to_html_frontmatter } from "@cocalc/frontend/markdown";
import { ExecOutput } from "../generic/client";
import { MarkdownConverterActions } from "../rmd-editor/base-actions";
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

export class Actions extends MarkdownConverterActions {
  // Expose the shared run_converter as run_qmd_converter for public API compatibility.
  get run_qmd_converter(): Function {
    return this.run_converter;
  }

  protected get minimal_template(): string {
    return MINIMAL;
  }

  _init2(): void {
    super._init2(); // that's the one in markdown-editor/actions.ts
    if (!this.is_public) {
      // one extra thing after markdown.
      this._syncstring.once("ready", this._init_converter.bind(this));
      this._check_produced_files();
      this.setState({ custom_pdf_error_message });
      this._syncstring.on(
        "change",
        debounce(this.ensureNonempty.bind(this), 1500),
      );
    }
  }

  protected async _run_converter(hash?): Promise<void> {
    if (this._syncstring == null || this._syncstring.get_state() != "ready") {
      // do not run if not ready -- important due to the debounce, which could
      // fire this at any time.
      return;
    }
    if (this._last_hash == null) {
      this._last_hash = this._syncstring.hash_of_saved_version();
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
        hash: hash || this._last_hash || Date.now(),
        set_job_info: this.set_job_info.bind(this),
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
}
