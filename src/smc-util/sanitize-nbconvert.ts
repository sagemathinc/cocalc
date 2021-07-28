/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// All jupyter nbconvert invocation have to sanitize the full input path.
// The reason is https://github.com/jupyter/nbconvert/issues/911
//
// e.g. "foo*bar??baz[.xyz" → "foo[*]bar[?][?]baz[[].xyz"
export function sanitize_nbconvert_path(path: string) {
  // this should be equivalent to glob.escape in python3
  // https://docs.python.org/3/library/glob.html#glob.escape
  return path.replace(/([\[*?\]])/g, "[$1]");
}
