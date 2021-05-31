/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// All jupyter nbconvert invocation have to sanitize the full input path.
// The reason is https://github.com/jupyter/nbconvert/issues/911

const LEFT = {};

// this is a bit tricky, because we can't simultaneously replace left and right square brackets.
// in the first pass "split_left", we insert tokens LEFT for the locations where '[' should be.
// replacing the right "]" is then easy.
export function sanitize_nbconvert_path(path: string) {
  const split_left = path.split("[");
  const zip_left = [];
  split_left.forEach(function (token, idx) {
    zip_left.push(token);
    if (idx < split_left.length - 1) {
      zip_left.push(LEFT);
    }
  });
  const sani = zip_left.map(function (token) {
    if (token === LEFT) {
      return "[[]";
    } else {
      return token.replace(/\]/g, "[]]");
    }
  });
  return sani.join("");
}
