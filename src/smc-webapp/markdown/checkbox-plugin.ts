/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This code is inspired by https://github.com/mcecot/markdown-it-checkbox

// However it is meant to behave much like Github, in terms of parsing.

function checkboxReplace(md, _options) {
  let index = 0;
  const pattern = /\[(X|\s)\](.*)/i;
  function createTokens(
    checked: boolean,
    before: string,
    after: string,
    Token
  ) {
    // before <input type="checkbox" data-index="{n}" checked="true"> after
    const checkbox_token = new Token("checkbox_input", "input", 0);
    checkbox_token.attrs = [
      [
        "style",
        "margin: 0 0.2em 0.2em 0.2em; transform: scale(1.5); vertical-align: middle;",
      ],
      ["type", "checkbox"],
      ["data-index", `${index}`],
      [
        "disabled",
        "true",
      ] /* disabled: anything in cocalc that is just directly
           rendering this doesn't know how to change it.*/,
    ];
    if (checked) {
      checkbox_token.attrs.push(["checked", "true"]);
      checkbox_token.checked = checked;
    }

    const before_token = new Token("text", "", 0);
    before_token.content = before;

    const after_token = new Token("text", "", 0);
    if (after[0] != " ") {
      after = " " + after;
    }
    after_token.content = after;
    index += 1;
    return [before_token, checkbox_token, after_token];
  }

  function splitTextToken(original, Token) {
    const text = original.content;
    const match = text.match(pattern);
    if (match === null) {
      return original;
    }
    const before = text.slice(0, match.index);
    const value = match[1];
    const checked = value === "X" || value === "x";
    const after = match[2];
    return createTokens(checked, before, after, Token);
  }

  return (state) => {
    index = 0;
    const blockTokens = state.tokens;
    for (let j = 0; j < blockTokens.length; j++) {
      if (blockTokens[j].type !== "inline") {
        continue;
      }
      let tokens = blockTokens[j].children;
      for (let i = tokens.length - 1; i >= 0; i--) {
        const token = tokens[i];
        blockTokens[j].children = tokens = md.utils.arrayReplaceAt(
          tokens,
          i,
          splitTextToken(token, state.Token)
        );
      }
    }
  };
}

export function checkboxPlugin(md, options) {
  md.core.ruler.push("checkbox", checkboxReplace(md, options));
}
