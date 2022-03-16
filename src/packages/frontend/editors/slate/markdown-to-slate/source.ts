import type { Token } from "./types";

export default function getSource(token: Token, lines: string[]): string {
  if (token.map == null) {
    throw Error("token.map must be set");
  }
  let [start, end] = token.map;
  if (token.type.startsWith("math_")) {
    // The markdown-it-texmath plugin gets this off by 1 compared to everything else,
    // so we make up for it.  This is, of course, nerve wracking, since if the caching
    // were ever wrong it could result in corrupted markdown when editing.
    end += 1;
  }
  let markdown = "\n" + lines.slice(start, end).join("\n") + "\n";
  markdown = markdown.replace(/^\n/, "").replace(/\n+$/, "") + "\n\n";
  return markdown;
}
