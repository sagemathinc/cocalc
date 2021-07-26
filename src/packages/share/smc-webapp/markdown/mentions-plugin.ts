/*
 *  LICENSE: MIT (same as upstream hashtags plugin)
 */

/*

What this plugin mainly does is take a stream of inline tokens like this:

...
{type: "text", ...}
{type: "html_inline", content: "<span class="user-mention" account-id=47d0393e-4814-4452-bb6c-35bac4cbd314 >", ...}
{type: "text", content: "@Bella Welski", ...}
{type: "html_inline", content: "</span>", ...}
{type: "text", ...}
...

and turn it into

...
{type: "text", ...}
{type: "mention", account_id: "47d0393e-4814-4452-bb6c-35bac4cbd314 >", name:"Bella Welski", ...}
{type: "text", ...}
...


It also defines a renderer.

The motivation is that in CoCalc we store our mentions in markdown as

    <span class="user-mention" account-id=47d0393e-4814-4452-bb6c-35bac4cbd314 >@Bella Welski</span>

With an appropriate class user-mention, this does render fine with no
processing at all.  However, by parsing this, we can also use mentions
in our Slate editor, and it's much easier to dynamically update the
user's name (with given account_id) if they change it.  Morever, we could
easily use user colors, avatars, etc. to render mention users
with this parser, but it's much harder without.

*/

function renderMention(tokens, idx): string {
  // TODO: we could dynamically update the username using the account-id
  // in case it changed from what is stored in the doc.
  // This user-mention is a CSS class we defined somewhere...
  const token = tokens[idx];
  return `<span class="user-mention">@${token.name}</span>`;
}

function isMentionOpen(str: string): boolean {
  return str.startsWith('<span class="user-mention" ');
}
function isMentionClose(str: string): boolean {
  return str == "</span>";
}

export function mentionPlugin(md): void {
  function mention(state) {
    const { Token, tokens: blockTokens } = state;

    for (let j = 0; j < blockTokens.length; j++) {
      if (blockTokens[j].type !== "inline") {
        continue;
      }

      let tokens = blockTokens[j].children;

      for (let i = tokens.length - 1; i >= 2; i--) {
        if (
          !(
            isMentionClose(tokens[i].content) &&
            isMentionOpen(tokens[i - 2].content)
          )
        ) {
          continue;
        }
        // tokens[i-2] like:   <span class="user-mention" account-id=47d0393e-4814-4452-bb6c-35bac4cbd314 >
        // tokens[i-1] like:   @Bella Welski
        // and tokens[i] like: </span>
        const { level } = tokens[i];
        const token = new Token("mention", "", 0);
        token.level = level;
        const i0 = tokens[i - 2].content.lastIndexOf("=");
        token.account_id = tokens[i - 2].content.slice(i0 + 1, i0 + 37);
        token.name = tokens[i - 1].content.slice(1).trim();

        tokens = tokens
          .slice(0, i - 2)
          .concat([token])
          .concat(tokens.slice(i + 1));

        // replace current node
        blockTokens[j].children = tokens;

        i -= 2;
      }
    }
  }

  md.core.ruler.after("inline", "mention", mention);
  md.renderer.rules.mention = renderMention;
}
