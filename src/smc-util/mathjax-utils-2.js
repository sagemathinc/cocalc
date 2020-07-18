/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Additional mathjax utilities.
*/

const { remove_math, replace_math } = require("./mathjax-utils");
const { is_array } = require("./misc");

// string -- a string
// v -- either a single function or an array of functions
// First strips out math, applies all the functions, then puts the math back.
exports.apply_without_math = function (string, v) {
  let math;
  if (!is_array(v)) {
    v = [v];
  }
  [string, math] = remove_math(string, true); // true so doesn't mess with &, etc.
  for (let f of v) {
    string = f(string);
  }
  return replace_math(string, math);
};
