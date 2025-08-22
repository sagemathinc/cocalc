/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Use a formatter like prettier to format a string of code.
*/

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
import { remove_math, replace_math } from "@cocalc/util/mathjax-utils";
import type {
  Syntax as FormatterSyntax,
  Config,
  Options,
} from "@cocalc/util/code-formatter";
export type { Config, Options, FormatterSyntax };
import { getLogger } from "@cocalc/backend/logger";

const logger = getLogger("project:formatters");

export async function formatString({
  options,
  str,
  path,
}: {
  str: string;
  options: Options; // e.g., {parser:'python'}
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
      const prettier = await import("prettier"  );
      formatted = await prettier.format(input, options as any);
  }

  if (options.parser === "markdown") {
    formatted = math_unescape(replace_math(formatted, math));
  }
  return formatted;
}
