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

declare let require: any;

const { math_escape, math_unescape } = require("../smc-util/markdown-utils");
const prettier = require("prettier");
const { latex_format } = require("./latex-format");
const { python_format } = require("./python-format");
const { html_format } = require("./html-format");
const { xml_format } = require("./xml-format");
const { bib_format } = require("./bib-format");
const { r_format } = require("./r-format");
const { clang_format } = require("./clang-format");
const { gofmt } = require("./gofmt");
const { rust_format } = require("./rust-format");
const misc = require("../smc-util/misc");
const { make_patch } = require("../smc-util/sync/editor/generic/util");
const { remove_math, replace_math } = require("../smc-util/mathjax-utils"); // from project Jupyter

import { once } from "../smc-util/async-utils";

import { Parser as FormatterParser } from "../smc-util/code-formatter";

export interface Options {
  parser: FormatterParser;
  tabWidth?: number;
  useTabs?: boolean;
}

export async function run_prettier(
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
      phase: "format"
    };
  }
  if (syncstring.get_state() != "ready") {
    await once(syncstring, "ready");
  }
  const doc = syncstring.get_doc();
  let pretty, math;
  let input = doc.to_str();
  if (options.parser === "markdown") {
    [input, math] = remove_math(math_escape(input));
  }
  try {
    pretty = await run_prettier_string(path, input, options, logger);
  } catch (err) {
    logger.debug(`run_prettier error: ${err.message}`);
    return { status: "error", phase: "format", error: err.message };
  }
  if (options.parser === "markdown") {
    pretty = math_unescape(replace_math(pretty, math));
  }
  // NOTE: the code used to make the change here on the backend.
  // See https://github.com/sagemathinc/cocalc/issues/4335 for why
  // that leads to confusion.
  const patch = make_patch(input, pretty);
  return { status: "ok", patch };
}

export async function run_prettier_string(
  path: string | undefined,
  str: string,
  options: Options,
  logger: any
): Promise<string> {
  let pretty;
  logger.debug(`run_prettier options.parser: "${options.parser}"`);
  switch (options.parser) {
    case "latex":
      pretty = await latex_format(str, options);
      break;
    case "python":
      pretty = await python_format(str, options, logger);
      break;
    case "r":
      pretty = await r_format(str, options, logger);
      break;
    case "html-tidy":
    case "tidy":
      pretty = await html_format(str, options, logger);
      break;
    case "xml-tidy":
      pretty = await xml_format(str, options, logger);
      break;
    case "bib-biber":
      pretty = await bib_format(str, options, logger);
      break;
    case "clang-format":
      const ext = misc.filename_extension(path != null ? path : "");
      pretty = await clang_format(str, options, ext, logger);
      break;
    case "gofmt":
      pretty = await gofmt(str, options, logger);
      break;
    case "rust":
    case "rustfmt":
      pretty = await rust_format(str, options, logger);
      break;
    default:
      pretty = prettier.format(str, options);
  }
  return pretty;
}
