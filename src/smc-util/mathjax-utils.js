// This is taken from Jupyter, which is BSD/Apache2 licensed... -- https://github.com/jupyter/notebook/blob/master/notebook/static/notebook/js/mathjaxutils.js

// Some magic for deferring mathematical expressions to MathJax
// by hiding them from the Markdown parser.
// Some of the code here is adapted with permission from Davide Cervone
// under the terms of the Apache2 license governing the MathJax project.
// Other minor modifications are also due to StackExchange and are used with
// permission.

// MATHSPLIT contains the pattern for math delimiters and special symbols
// needed for searching for math in the text input.
var MATHSPLIT = /(\$\$?|\\(?:begin|end)\{[a-z]*\*?\}|\\[{}$]|[{}]|(?:\n\s*)+|@@\d+@@|\\\\(?:\(|\)|\[|\]))/i;

regex_split = require("./regex-split").regex_split;

//  The math is in blocks i through j, so
//    collect it into one block and clear the others.
//  Clear the current math positions and store the index of the
//    math, then push the math string onto the storage array.
//  The preProcess function is called on all blocks if it has been passed in
var process_math = function(i, j, pre_process, math, blocks) {
  var block = blocks.slice(i, j + 1).join("");
  while (j > i) {
    blocks[j] = "";
    j--;
  }
  blocks[i] = "@@" + math.length + "@@"; // replace the current block text with a unique tag to find later
  if (pre_process) {
    block = pre_process(block);
  }
  math.push(block);
  return blocks;
};

//  Break up the text into its component parts and search
//    through them for math delimiters, braces, linebreaks, etc.
//  Math delimiters must match and braces must balance.
//  Don't allow math to pass through a double linebreak
//    (which will be a paragraph).
//
exports.remove_math = function(text) {
  var math = []; // stores math strings for later
  var start;
  var end;
  var last;
  var braces;

  // Except for extreme edge cases, this should catch precisely those pieces of the markdown
  // source that will later be turned into code spans. While MathJax will not TeXify code spans,
  // we still have to consider them at this point; the following issue has happened several times:
  //
  //     `$foo` and `$bar` are variables.  -->  <code>$foo ` and `$bar</code> are variables.

  var hasCodeSpans = /`/.test(text),
    de_tilde;
  if (hasCodeSpans) {
    text = text
      .replace(/~/g, "~T")
      .replace(/(^|[^\\])(`+)([^\n]*?[^`\n])\2(?!`)/gm, function(wholematch) {
        return wholematch.replace(/\$/g, "~D");
      });
    de_tilde = function(text) {
      return text.replace(/~([TD])/g, function(wholematch, character) {
        return { T: "~", D: "$" }[character];
      });
    };
  } else {
    de_tilde = function(text) {
      return text;
    };
  }

  var blocks = regex_split(text.replace(/\r\n?/g, "\n"), MATHSPLIT);

  for (var i = 1, m = blocks.length; i < m; i += 2) {
    var block = blocks[i];
    if (block.charAt(0) === "@") {
      //
      //  Things that look like our math markers will get
      //  stored and then retrieved along with the math.
      //
      blocks[i] = "@@" + math.length + "@@";
      math.push(block);
    } else if (start) {
      //
      //  If we are in math, look for the end delimiter,
      //    but don't go past double line breaks, and
      //    and balance braces within the math.
      //
      if (block === end) {
        if (braces) {
          last = i;
        } else {
          blocks = process_math(start, i, de_tilde, math, blocks);
          start = null;
          end = null;
          last = null;
        }
      } else if (block.match(/\n.*\n/)) {
        if (last) {
          i = last;
          blocks = process_math(start, i, de_tilde, math, blocks);
        }
        start = null;
        end = null;
        last = null;
        braces = 0;
      } else if (block === "{") {
        braces++;
      } else if (block === "}" && braces) {
        braces--;
      }
    } else {
      //
      //  Look for math start delimiters and when
      //    found, set up the end delimiter.
      //
      if (block === "$" || block === "$$") {
        start = i;
        end = block;
        braces = 0;
      } else if (block === "\\\\(" || block === "\\\\[") {
        start = i;
        end = block.slice(-1) === "(" ? "\\\\)" : "\\\\]";
        braces = 0;
      } else if (block.substr(1, 5) === "begin") {
        start = i;
        end = "\\end" + block.substr(6);
        braces = 0;
      }
    }
  }
  if (last) {
    blocks = process_math(start, last, de_tilde, math, blocks);
    start = null;
    end = null;
    last = null;
  }
  return [de_tilde(blocks.join("")), math];
};

//
//  Put back the math strings that were saved.
//
exports.replace_math = function(text, math) {
  // Replace all the math group placeholders in the text
  // with the saved strings.
  return text.replace(/@@(\d+)@@/g, function(match, n) {
    return math[n];
  });
};
