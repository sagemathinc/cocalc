/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Use a formatter like prettier to reformat a syncstring.

This very nicely use the in-memory node module to prettyify code, by simply modifying the syncstring
on the backend.  This avoids having to send the whole file back and forth, worrying about multiple users
and their cursors, file state etc.  -- it just merges in the prettification at a point in time.
Also, by doing this on the backend we don't add 5MB (!) to the webpack frontend bundle, to install
something that is not supported on the frontend anyway.
*/

import { make_patch } from "@cocalc/sync/editor/generic/util";
import { math_escape, math_unescape } from "@cocalc/util/markdown-utils";
import { filename_extension } from "@cocalc/util/misc";
import { bib_format } from "./bib-format";
import { clang_format } from "./clang-format";
import genericFormat from "./generic-format";
import { gofmt } from "./gofmt";
import { latex_format } from "./latex-format";
import { python_format } from "./python-format";
import { r_format } from "./r-format";
import { rust_format } from "./rust-format";
import { xml_format } from "./xml-format";
// mathjax-utils is from upstream project Jupyter
import { once } from "@cocalc/util/async-utils";
import { remove_math, replace_math } from "@cocalc/util/mathjax-utils";
import type {
  Syntax as FormatterSyntax,
  Config,
  Options,
  FormatResult,
} from "@cocalc/util/code-formatter";
export type { Config, Options, FormatterSyntax };
import { getLogger } from "@cocalc/backend/logger";
import { getClient } from "@cocalc/project/client";

// don't wait too long, since the entire api call likely times out after 5s.
const MAX_WAIT_FOR_SYNC = 3000;

const logger = getLogger("project:formatters");

export async function run_formatter({
  path,
  options,
  syncstring,
}: {
  path: string;
  options: Options;
  syncstring?;
}): Promise<FormatResult> {
  const client = getClient();
  // What we do is edit the syncstring with the given path to be "prettier" if possible...
  if (syncstring == null) {
    syncstring = client.syncdoc({ path });
  }
  if (syncstring == null || syncstring.get_state() == "closed") {
    return {
      status: "error",
      error: "document not fully opened",
      phase: "format",
    };
  }
  if (syncstring.get_state() != "ready") {
    await once(syncstring, "ready");
  }
  if (options.lastChanged) {
    // wait within reason until syncstring's last change is this new.
    // (It's not a huge problem if this fails for some reason.)
    const start = Date.now();
    const waitUntil = new Date(options.lastChanged);
    while (
      Date.now() - start < MAX_WAIT_FOR_SYNC &&
      syncstring.last_changed() < waitUntil
    ) {
      try {
        await once(
          syncstring,
          "change",
          MAX_WAIT_FOR_SYNC - (Date.now() - start),
        );
      } catch {
        break;
      }
    }
  }
  const doc = syncstring.get_doc();
  let formatted, input0;
  let input = (input0 = doc.to_str());
  try {
    formatted = await run_formatter_string({ path, str: input, options });
  } catch (err) {
    logger.debug(`run_formatter error: ${err.message}`);
    return { status: "error", phase: "format", error: err.message };
  }
  // NOTE: the code used to make the change here on the backend.
  // See https://github.com/sagemathinc/cocalc/issues/4335 for why
  // that leads to confusion.
  const patch = make_patch(input0, formatted);
  return { status: "ok", patch };
}

export async function run_formatter_string({
  options,
  str,
  path,
}: {
  str: string;
  options: Options;
  path?: string; // only used for CLANG
}): Promise<string> {
  let formatted, math;
  let input = str;
  logger.debug(`run_formatter options.parser: "${options.parser}"`);
  if (options.parser === "markdown") {
    [input, math] = remove_math(math_escape(input));
  }

  switch (options.parser) {
    case "latex":
    case "latexindent":
      formatted = await latex_format(input, options);
      break;
    case "python":
    case "yapf":
      formatted = await python_format(input, options, logger);
      break;
    case "zig":
      formatted = await genericFormat({
        command: "zig",
        args: (tmp) => ["fmt", tmp],
        input,
        timeout_s: 30,
      });
      break;
    case "r":
    case "formatR":
      formatted = await r_format(input, options, logger);
      break;
    case "xml-tidy":
      formatted = await xml_format(input, options, logger);
      break;
    case "bib-biber":
      formatted = await bib_format(input, options, logger);
      break;
    case "clang-format":
      const ext = filename_extension(path != null ? path : "");
      formatted = await clang_format(input, ext, options, logger);
      break;
    case "gofmt":
      formatted = await gofmt(input, options, logger);
      break;
    case "rust":
    case "rustfmt":
      formatted = await rust_format(input, options, logger);
      break;
    default:
      const prettier = await import("prettier");
      formatted = await prettier.format(input, options as any);
  }

  if (options.parser === "markdown") {
    formatted = math_unescape(replace_math(formatted, math));
  }
  return formatted;
}
