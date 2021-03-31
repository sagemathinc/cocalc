/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export function sagews_canonical_mode(name, default_mode) {
  switch (name) {
    case "markdown":
      return "md";
    case "xml":
      return "html";
    case "mediawiki":
      return "mediawiki";
    case "stex":
      return "tex";
    case "python":
      return "python";
    case "r":
      return "r";
    case "sagews":
      return "sage";
    case "shell":
      return "shell";
    default:
      return default_mode;
  }
}
