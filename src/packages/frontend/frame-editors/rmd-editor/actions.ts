/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
R Markdown Editor Actions
*/

// cSpell:ignore rnorm

import { debounce } from "lodash";

import { open_new_tab } from "@cocalc/frontend/misc";
import { markdown_to_html_frontmatter } from "@cocalc/frontend/markdown";
import { ExecOutput } from "../generic/client";
import { MarkdownConverterActions } from "./base-actions";
import { convert } from "./rmd-converter";

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

export class Actions extends MarkdownConverterActions {
  // Expose the shared run_converter as run_rmd_converter for public API compatibility.
  get run_rmd_converter(): Function {
    return this.run_converter;
  }

  protected get minimal_template(): string {
    return MINIMAL;
  }

  _init2(): void {
    super._init2(); // that's the one in markdown-editor/actions.ts
    this.build = this.build.bind(this);
    // one extra thing after markdown.
    this._syncstring.once("ready", () => {
      this._init_converter();
    });
    this._check_produced_files();
    this.setState({ custom_pdf_error_message });
    this._syncstring.on(
      "change",
      debounce(this.ensureNonempty.bind(this), 1500),
    );
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
        hash || this._last_hash || Date.now(),
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

  help(): void {
    open_new_tab(HELP_URL);
  }
}
