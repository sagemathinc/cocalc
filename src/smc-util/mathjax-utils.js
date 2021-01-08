/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This is taken from Jupyter, which is BSD/Apache2 licensed... -- https://github.com/jupyter/notebook/blob/master/notebook/static/notebook/js/mathjaxutils.js

// Some magic for deferring mathematical expressions to MathJax
// by hiding them from the Markdown parser.
// Some of the code here is adapted with permission from Davide Cervone
// under the terms of the Apache2 license governing the MathJax project.
// Other minor modifications are also due to StackExchange and are used with
// permission.

// MATHSPLIT contains the pattern for math delimiters and special symbols
// needed for searching for math in the text input.

const MATHSPLIT = /(\$\$?|\\(?:begin|end)\{[a-z]*\*?\}|(?:\n\s*)+)/i;

// This would also capture \[ \]  \( \), but I don't want to do that because
// Jupyter classic doesn't and it conflicts too much with markdown.  Use $'s and e.g., \begin{equation}.
// const MATHSPLIT = /(\$\$?|\\(?:begin|end)\{[a-z]*\*?\}|(?:\n\s*)+|\\(?:\(|\)|\[|\]))/i;

import { regex_split } from "./regex-split";

//  The math is in blocks i through j, so
//    collect it into one block and clear the others.
//  Clear the current math positions and store the index of the
//    math, then push the math string onto the storage array.
//  The preProcess function is called on all blocks if it has been passed in
function process_math(i, j, pre_process, math, blocks, open_tag, close_tag) {
  let block = blocks.slice(i, j + 1).join("");
  while (j > i) {
    blocks[j] = "";
    j--;
  }
  blocks[i] = open_tag + math.length + close_tag; // replace the current block text with a unique tag to find later
  if (pre_process) {
    block = pre_process(block);
  }
  math.push(block);
  return blocks;
}

//  Break up the text into its component parts and search
//    through them for math delimiters, braces, linebreaks, etc.
//  Math delimiters must match and braces must balance.
//  Don't allow math to pass through a double linebreak
//    (which will be a paragraph).
//

// Do *NOT* conflict with the ones used in ./markdown-utils.ts
export const MATH_ESCAPE = "\uFE32\uFE33"; // unused unicode -- hardcoded below too

export function remove_math(
  text,
  open_tag = MATH_ESCAPE,
  close_tag = MATH_ESCAPE
) {
  let math = []; // stores math strings for later
  let start;
  let end;
  let last;
  let braces;

  // Except for extreme edge cases, this should catch precisely those pieces of the markdown
  // source that will later be turned into code spans. While MathJax will not TeXify code spans,
  // we still have to consider them at this point; the following issue has happened several times:
  //
  //     `$foo` and `$bar` are variables.  -->  <code>$foo ` and `$bar</code> are variables.

  let hasCodeSpans = /`/.test(text),
    de_tilde;
  if (hasCodeSpans) {
    text = text
      .replace(/~/g, "~T")
      .replace(/(^|[^\\])(`+)([^\n]*?[^`\n])\2(?!`)/gm, function (wholematch) {
        return wholematch.replace(/\$/g, "~D");
      });
    de_tilde = function (text) {
      return text.replace(/~([TD])/g, function (wholematch, character) {
        return { T: "~", D: "$" }[character];
      });
    };
  } else {
    de_tilde = function (text) {
      return text;
    };
  }

  let blocks = regex_split(text.replace(/\r\n?/g, "\n"), MATHSPLIT);

  for (let i = 1, m = blocks.length; i < m; i += 2) {
    const block = blocks[i];
    if (start) {
      //
      //  If we are in math, look for the end delimiter,
      //    but don't go past double line breaks, and
      //    and balance braces within the math.
      //
      if (block === end) {
        if (braces) {
          last = i;
        } else {
          blocks = process_math(
            start,
            i,
            de_tilde,
            math,
            blocks,
            open_tag,
            close_tag
          );
          start = null;
          end = null;
          last = null;
        }
      } else if (block.match(/\n.*\n/)) {
        if (last) {
          i = last;
          blocks = process_math(
            start,
            i,
            de_tilde,
            math,
            blocks,
            open_tag,
            close_tag
          );
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
    blocks = process_math(
      start,
      last,
      de_tilde,
      math,
      blocks,
      open_tag,
      close_tag
    );
    start = null;
    end = null;
    last = null;
  }
  return [de_tilde(blocks.join("")), math];
}

//
//  Put back the math strings that were saved.
//
export function replace_math(text, math) {
  // Replace all the math group placeholders in the text
  // with the saved strings.
  return text.replace(/\uFE32\uFE33(\d+)\uFE32\uFE33/g, function (match, n) {
    return math[n];
  });
}
