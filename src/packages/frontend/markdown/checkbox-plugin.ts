/*
 *  LICENSE: MIT (same as upstream)
 */

// This code is inspired by https://github.com/mcecot/markdown-it-checkbox

// However it is meant to behave much like Github, in terms of parsing.

function checkboxReplace(_md, _options) {
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
    after_token.content = after;
    index += 1;
    return [before_token, checkbox_token, after_token];
  }

  function splitTextToken(original, Token) {
    if (original.markup != "") return null; // don't make checkboxes, e.g., inside of `code` like `R[x]`.
    const text = original.content;
    const match = text.match(pattern);
    if (match === null) {
      return null;
    }
    const before = text.slice(0, match.index);
    const value = match[1];
    const checked = value === "X" || value === "x";
    const after = match[2];
    return createTokens(checked, before, after, Token);
  }

  return (state) => {
    for (const token of state.tokens) {
      if (token.type !== "inline") {
        // fenced blocks, etc., should be ignored of course.
        continue;
      }
      // Process all the children, setting has_checkboxes
      // to true if any are found.
      let has_checkboxes: boolean = false;
      const v: any[] = [];
      for (const child of token.children) {
        const x = splitTextToken(child, state.Token);
        if (x != null) {
          has_checkboxes = true;
          v.push(x);
        } else {
          v.push([child]);
        }
      }

      if (has_checkboxes) {
        // Found at least one checkbox, so replace children.  See
        // https://stackoverflow.com/questions/5080028/what-is-the-most-efficient-way-to-concatenate-n-arrays
        // for why we concat arrays this way.
        token.children = [].concat.apply([], v);
      }
    }
  };
}

export function checkboxPlugin(md, options) {
  md.core.ruler.push("checkbox", checkboxReplace(md, options));
}
