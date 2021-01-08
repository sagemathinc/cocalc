/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This code is inspired by https://github.com/mcecot/markdown-it-checkbox

function checkboxReplace(md, _options) {
  let index = 0;
  const pattern = /\[(X|\s)\]\s(.*)/i;
  function createTokens(checked: boolean, label: string, Token) {
    // <input type="checkbox" data-index="{n}" checked="true"> label
    const checkbox_token = new Token("checkbox_input", "input", 0);
    checkbox_token.attrs = [
      ["type", "checkbox"],
      ["data-index", `${index}`],
    ];
    if (checked) {
      checkbox_token.attrs.push(["checked", "true"]);
      checkbox_token.checked = checked;
    }
    const label_token = new Token("text", "", 0);
    label_token.content = label;
    index += 1;
    return [checkbox_token, label_token];
  }

  function splitTextToken(original, Token) {
    let checked, label, matches, text, value;
    text = original.content;
    matches = text.match(pattern);
    if (matches === null) {
      return original;
    }
    checked = false;
    value = matches[1];
    label = matches[2];
    if (value === "X" || value === "x") {
      checked = true;
    }
    return createTokens(checked, label, Token);
  }

  return (state) => {
    const blockTokens = state.tokens;
    let j = 0;
    let l = blockTokens.length;
    while (j < l) {
      if (blockTokens[j].type !== "inline") {
        j++;
        continue;
      }
      let tokens = blockTokens[j].children;
      let i = tokens.length - 1;
      while (i >= 0) {
        const token = tokens[i];
        blockTokens[j].children = tokens = md.utils.arrayReplaceAt(
          tokens,
          i,
          splitTextToken(token, state.Token)
        );
        i--;
      }
      j++;
    }
  };
}

export function checkboxPlugin(md, options) {
  md.core.ruler.push("checkbox", checkboxReplace(md, options));
}
