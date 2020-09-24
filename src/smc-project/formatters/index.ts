/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Use a formatter like prettier to reformat a syncstring.

This very nicely use the in-memory node module to prettyify code, by simply modifying the syncstring
on the backend.  This avoids having to send the whole file back and forth, worrying about multiple users
and their cursors, file state etc.  -- it just merges in the prettification at a point in time.
Also, by doing this on the backend we don't add 5MB (!) to the webpack frontend bundle, to install
something that is not supported on the frontend anyway.
*/

declare let require: any;

const { math_escape, math_unescape } = require("../smc-util/markdown-utils");
import { latex_format } from "./latex-format";
import { python_format } from "./python-format";
import { html_format } from "./html-format";
import { xml_format } from "./xml-format";
import { bib_format } from "./bib-format";
import { r_format } from "./r-format";
import { clang_format } from "./clang-format";
import { gofmt } from "./gofmt";
import { rust_format } from "./rust-format";
const misc = require("../smc-util/misc");
const { make_patch } = require("../smc-util/sync/editor/generic/util");
const { remove_math, replace_math } = require("../smc-util/mathjax-utils"); // from project Jupyter
import { get_prettier } from "./prettier-lib";
import { once } from "../smc-util/async-utils";
import { Syntax as FormatterSyntax } from "../smc-util/code-formatter";

export interface Config {
  syntax: FormatterSyntax;
  tabWidth?: number;
  useTabs?: boolean;
}

export interface Options extends Omit<Config, "syntax"> {
  parser: FormatterSyntax; // TODO refactor this to tool
  tabWidth?: number;
}

export async function run_formatter(
  client: any,
  path: string,
  options: Options,
  logger: any
): Promise<object> {
  // What we do is edit the syncstring with the given path to be "prettier" if possible...
  const syncstring = client.syncdoc({ path });
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
  const doc = syncstring.get_doc();
  let formatted, math, input0;
  let input = (input0 = doc.to_str());
  if (options.parser === "markdown") {
    [input, math] = remove_math(math_escape(input));
  }
  try {
    formatted = await run_formatter_string(path, input, options, logger);
  } catch (err) {
    logger.debug(`run_formatter error: ${err.message}`);
    return { status: "error", phase: "format", error: err.message };
  }
  if (options.parser === "markdown") {
    formatted = math_unescape(replace_math(formatted, math));
  }
  // NOTE: the code used to make the change here on the backend.
  // See https://github.com/sagemathinc/cocalc/issues/4335 for why
  // that leads to confusion.
  const patch = make_patch(input0, formatted);
  return { status: "ok", patch };
}

export async function run_formatter_string(
  path: string | undefined,
  str: string,
  options: Options,
  logger: any
): Promise<string> {
  let formatted;
  logger.debug(`run_formatter options.parser: "${options.parser}"`);
  switch (options.parser) {
    case "latex":
    case "latexindent":
      formatted = await latex_format(str, options);
      break;
    case "python":
    case "yapf":
      formatted = await python_format(str, options, logger);
      break;
    case "r":
    case "formatR":
      formatted = await r_format(str, options, logger);
      break;
    case "html-tidy":
      formatted = await html_format(str, options, logger);
      break;
    case "xml-tidy":
      formatted = await xml_format(str, options, logger);
      break;
    case "bib-biber":
      formatted = await bib_format(str, options, logger);
      break;
    case "clang-format":
      const ext = misc.filename_extension(path != null ? path : "");
      formatted = await clang_format(str, ext, options, logger);
      break;
    case "gofmt":
      formatted = await gofmt(str, options, logger);
      break;
    case "rust":
    case "rustfmt":
      formatted = await rust_format(str, options, logger);
      break;
    default:
      const prettier = get_prettier();
      if (prettier != null) {
        formatted = prettier.format(str, options);
      } else {
        throw Error("Could not load 'prettier'");
      }
  }
  return formatted;
}
