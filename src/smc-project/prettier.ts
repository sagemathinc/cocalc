/*
Use Prettier to reformat the syncstring.

This very nicely use the in-memory node module to prettyify code, by simply modifying the syncstring
on the backend.  This avoids having to send the whole file back and forth, worrying about multiple users
and their cursors, file state etc.  -- it just merges in the prettification at a point in time.
Also, by doing this on the backend we don't add 5MB (!) to the webpack frontend bundle, to install
something that is not supported on the frontend anyway.

---

NOTE: for tex files, we use latexformat, rather than prettier.
*/

declare var require: any;

const { math_escape, math_unescape } = require("smc-util/markdown-utils");
const prettier = require("prettier");
const { latex_format } = require("./latex-format");
const { python_format } = require("./python-format");
const { html_format } = require("./html-format");
const { r_format } = require("./r-format");
const body_parser = require("body-parser");
const express = require("express");
const { remove_math, replace_math } = require("smc-util/mathjax-utils"); // from project Jupyter

import { callback } from "awaiting";

export async function run_prettier(
  client: any,
  path: string,
  options: any,
  logger: any
): Promise<object> {
  // What we do is edit the syncstring with the given path to be "prettier" if possible...
  let syncstring = client.sync_string({ path, reference_only: true });
  if (syncstring == null) {
    /* file not opened yet -- nothing to do. */
    return { status: "ok", phase: "loading" };
  }

  let pretty, math;
  let input = syncstring.get_doc().to_str();
  if (options.parser === "markdown") {
    [input, math] = remove_math(math_escape(input));
  }
  try {
    logger.debug(`run_prettier options.parser: "${options.parser}"`);
    switch (options.parser) {
      case "latex":
        pretty = await latex_format(input, options);
        break;
      case "python":
        pretty = await python_format(input, options, logger);
        break;
      case "r":
        pretty = await r_format(input, options, logger);
        break;
      case "html-tidy":
        pretty = await html_format(input, options);
        break;
      default:
        pretty = prettier.format(input, options);
    }
  } catch (err) {
    logger.debug(`run_prettier error: ${err.message}`);
    return { status: "error", phase: "format", error: err.message };
  }
  if (options.parser === "markdown") {
    pretty = math_unescape(replace_math(pretty, math));
  }
  syncstring.from_str(pretty);
  await callback(syncstring._save);
  return { status: "ok" };
}
