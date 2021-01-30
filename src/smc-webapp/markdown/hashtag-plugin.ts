/*
 *  LICENSE: MIT (same as upstream)
 */

/*
This is a rewrite of https://github.com/svbergerem/markdown-it-hashtag

LICENSE: MIT (same as the original upstream).

CHANGES:
- typescript
- only one token instead of three, which makes more sense to
  me (better for conversion to slate)
*/

function renderHashtag(tokens, idx): string {
  // obviously pretty specific to cocalc...
  // Looks like antd tag, but scales.
  return `<span style="color:#1b95e0;background-color:#fafafa;border:1px solid #d9d9d9;padding:0 7px;border-radius:5px">#${tokens[idx].content}</span>`;
}

function isLinkOpen(str) {
  return /^<a[>\s]/i.test(str);
}
function isLinkClose(str) {
  return /^<\/a\s*>/i.test(str);
}

export function hashtagPlugin(md, options): void {
  let arrayReplaceAt = md.utils.arrayReplaceAt,
    escapeHtml = md.utils.escapeHtml,
    regex,
    hashtagRegExp = "\\w+",
    preceding = "^|\\s";

  if (options) {
    if (typeof options.preceding !== "undefined") {
      preceding = options.preceding;
    }
    if (typeof options.hashtagRegExp !== "undefined") {
      hashtagRegExp = options.hashtagRegExp;
    }
  }

  regex = new RegExp("(" + preceding + ")#(" + hashtagRegExp + ")", "g");

  function hashtag(state) {
    const { Token, tokens: blockTokens } = state;

    for (let j = 0, l = blockTokens.length; j < l; j++) {
      if (blockTokens[j].type !== "inline") {
        continue;
      }

      let tokens = blockTokens[j].children;

      let htmlLinkLevel = 0;

      for (let i = tokens.length - 1; i >= 0; i--) {
        const currentToken = tokens[i];

        // skip content of markdown links
        if (currentToken.type === "link_close") {
          i--;
          while (
            tokens[i].level !== currentToken.level &&
            tokens[i].type !== "link_open"
          ) {
            i--;
          }
          continue;
        }

        // skip content of html links
        if (currentToken.type === "html_inline") {
          // we are going backwards, so isLinkOpen shows end of link
          if (isLinkOpen(currentToken.content) && htmlLinkLevel > 0) {
            htmlLinkLevel--;
          }
          if (isLinkClose(currentToken.content)) {
            htmlLinkLevel++;
          }
        }
        if (htmlLinkLevel > 0) {
          continue;
        }

        if (currentToken.type !== "text") {
          continue;
        }

        // find hashtags
        let text = currentToken.content;
        const matches = text.match(regex);

        if (matches === null) {
          continue;
        }

        const nodes: any[] = [];
        const { level } = currentToken;

        for (let m = 0; m < matches.length; m++) {
          const tagName = matches[m].split("#", 2)[1];

          // find the beginning of the matched text
          let pos = text.indexOf(matches[m]);
          // find the beginning of the hashtag
          pos = text.indexOf("#" + tagName, pos);

          if (pos > 0) {
            const token = new Token("text", "", 0);
            token.content = text.slice(0, pos);
            token.level = level;
            nodes.push(token);
          }

          const token = new Token("hashtag", "", 0);
          token.content = escapeHtml(tagName);
          token.level = level;
          nodes.push(token);

          text = text.slice(pos + 1 + tagName.length);
        }

        if (text.length > 0) {
          const token = new Token("text", "", 0);
          token.content = text;
          token.level = level;
          nodes.push(token);
        }

        // replace current node
        blockTokens[j].children = tokens = arrayReplaceAt(tokens, i, nodes);
      }
    }
  }

  md.core.ruler.after("inline", "hashtag", hashtag);
  md.renderer.rules.hashtag = renderHashtag;
}
