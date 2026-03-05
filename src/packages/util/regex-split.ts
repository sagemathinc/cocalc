/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

//============================================================================
// Cross-browser RegEx Split
//============================================================================

// This code has been MODIFIED from the code licensed below to not replace the
// default browser split.  The license is reproduced here.

// see http://blog.stevenlevithan.com/archives/cross-browser-split for more info:
/*!
 * Cross-Browser Split 1.1.1
 * Copyright 2007-2012 Steven Levithan <stevenlevithan.com>
 * Available under the MIT License
 * ECMAScript compliant, uniform cross-browser split method
 */

/**
 * Splits a string into an array of strings using a regex separator.
 * Matches of the separator are not included in the result array.
 * However, if `separator` is a regex that contains capturing groups,
 * backreferences are spliced into the result each time `separator` is
 * matched. Fixes browser bugs compared to the native
 * `String.prototype.split` and can be used reliably cross-browser.
 *
 * @example
 * regex_split('a b c d', / /);
 * // -> ['a', 'b', 'c', 'd']
 *
 * @example
 * regex_split('a b c d', / /, 2);
 * // -> ['a', 'b']
 *
 * @example
 * regex_split('..word1 word2..', /([a-z]+)(\d+)/i);
 * // -> ['..', 'word', '1', ' ', 'word', '2', '..']
 */
export function regex_split(
  str: string,
  separator: RegExp,
  limit?: number,
): (string | undefined)[] {
  const output: (string | undefined)[] = [];

  const flags =
    (separator.ignoreCase ? "i" : "") +
    (separator.multiline ? "m" : "") +
    ((separator as any).extended ? "x" : "") + // Proposed for ES6
    (separator.sticky ? "y" : ""); // Firefox 3+

  // Make `global` and avoid `lastIndex` issues by working with a copy
  const globalSeparator = new RegExp(separator.source, flags + "g");

  let lastLastIndex = 0;
  let lastLength: number | undefined;

  // For non-compliant browsers that don't return `undefined` for
  // nonparticipating capturing groups.
  const compliantExecNpcg = typeof /()??/.exec("")![1] === "undefined";
  let separator2: RegExp | undefined;
  if (!compliantExecNpcg) {
    separator2 = new RegExp("^" + globalSeparator.source + "$(?!\\s)", flags);
  }

  // Values for `limit`, per the spec:
  //  If undefined: 4294967295 // Math.pow(2, 32) - 1
  //  If 0, Infinity, or NaN: 0
  //  If positive number: limit = Math.floor(limit); ...
  //  If negative number: 4294967296 - Math.floor(Math.abs(limit))
  //  If other: Type-convert, then use the above rules
  const effectiveLimit: number =
    typeof limit === "undefined"
      ? -1 >>> 0 // Math.pow(2, 32) - 1
      : limit >>> 0; // ToUint32(limit)

  let match: RegExpExecArray | null;
  for (
    match = globalSeparator.exec(str);
    match;
    match = globalSeparator.exec(str)
  ) {
    // `separator.lastIndex` is not reliable cross-browser
    const lastIndex = match.index + match[0].length;
    if (lastIndex > lastLastIndex) {
      output.push(str.slice(lastLastIndex, match.index));
      // Fix browsers whose `exec` methods don't consistently return `undefined`
      // for nonparticipating capturing groups
      if (!compliantExecNpcg && match.length > 1) {
        match[0].replace(separator2!, function (...args: any[]): string {
          for (let i = 1; i < args.length - 2; i++) {
            if (typeof args[i] === "undefined") {
              match![i] = undefined as any;
            }
          }
          return "";
        });
      }
      if (match.length > 1 && match.index < str.length) {
        Array.prototype.push.apply(output, match.slice(1));
      }
      lastLength = match[0].length;
      lastLastIndex = lastIndex;
      if (output.length >= effectiveLimit) {
        break;
      }
    }
    if (globalSeparator.lastIndex === match.index) {
      globalSeparator.lastIndex++; // Avoid an infinite loop
    }
  }
  if (lastLastIndex === str.length) {
    if (lastLength || !globalSeparator.test("")) {
      output.push("");
    }
  } else {
    output.push(str.slice(lastLastIndex));
  }
  return output.length > effectiveLimit
    ? output.slice(0, effectiveLimit)
    : output;
}

//============================================================================
// End contributed Cross-browser RegEx Split
//============================================================================
