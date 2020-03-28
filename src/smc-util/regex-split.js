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
 * Splits a string into an array of strings using a regex or string
 * separator. Matches of the separator are not included in the result array.
 * However, if `separator` is a regex that contains capturing groups,
 * backreferences are spliced into the result each time `separator` is
 * matched. Fixes browser bugs compared to the native
 * `String.prototype.split` and can be used reliably cross-browser.
 * @param {String} str String to split.
 * @param {RegExp} separator Regex to use for separating
 *     the string.
 * @param {Number} [limit] Maximum number of items to include in the result
 *     array.
 * @returns {Array} Array of substrings.
 * @example
 *
 * // Basic use
 * regex_split('a b c d', ' ');
 * // -> ['a', 'b', 'c', 'd']
 *
 * // With limit
 * regex_split('a b c d', ' ', 2);
 * // -> ['a', 'b']
 *
 * // Backreferences in result array
 * regex_split('..word1 word2..', /([a-z]+)(\d+)/i);
 * // -> ['..', 'word', '1', ' ', 'word', '2', '..']
 */
exports.regex_split = function (str, separator, limit) {
  var output = [],
    flags =
      (separator.ignoreCase ? "i" : "") +
      (separator.multiline ? "m" : "") +
      (separator.extended ? "x" : "") + // Proposed for ES6
      (separator.sticky ? "y" : ""), // Firefox 3+
    lastLastIndex = 0,
    separator2,
    match,
    lastIndex,
    lastLength;
  // Make `global` and avoid `lastIndex` issues by working with a copy
  separator = new RegExp(separator.source, flags + "g");

  var compliantExecNpcg = typeof /()??/.exec("")[1] === "undefined";
  if (!compliantExecNpcg) {
    // Doesn't need flags gy, but they don't hurt
    separator2 = new RegExp("^" + separator.source + "$(?!\\s)", flags);
  }
  /* Values for `limit`, per the spec:
   * If undefined: 4294967295 // Math.pow(2, 32) - 1
   * If 0, Infinity, or NaN: 0
   * If positive number: limit = Math.floor(limit); if (limit > 4294967295) limit -= 4294967296;
   * If negative number: 4294967296 - Math.floor(Math.abs(limit))
   * If other: Type-convert, then use the above rules
   */
  limit =
    typeof limit === "undefined"
      ? -1 >>> 0 // Math.pow(2, 32) - 1
      : limit >>> 0; // ToUint32(limit)
  for (match = separator.exec(str); match; match = separator.exec(str)) {
    // `separator.lastIndex` is not reliable cross-browser
    lastIndex = match.index + match[0].length;
    if (lastIndex > lastLastIndex) {
      output.push(str.slice(lastLastIndex, match.index));
      // Fix browsers whose `exec` methods don't consistently return `undefined` for
      // nonparticipating capturing groups
      if (!compliantExecNpcg && match.length > 1) {
        match[0].replace(separator2, function () {
          for (var i = 1; i < arguments.length - 2; i++) {
            if (typeof arguments[i] === "undefined") {
              match[i] = undefined;
            }
          }
        });
      }
      if (match.length > 1 && match.index < str.length) {
        Array.prototype.push.apply(output, match.slice(1));
      }
      lastLength = match[0].length;
      lastLastIndex = lastIndex;
      if (output.length >= limit) {
        break;
      }
    }
    if (separator.lastIndex === match.index) {
      separator.lastIndex++; // Avoid an infinite loop
    }
  }
  if (lastLastIndex === str.length) {
    if (lastLength || !separator.test("")) {
      output.push("");
    }
  } else {
    output.push(str.slice(lastLastIndex));
  }
  return output.length > limit ? output.slice(0, limit) : output;
};

//============================================================================
// End contributed Cross-browser RegEx Split
//============================================================================
