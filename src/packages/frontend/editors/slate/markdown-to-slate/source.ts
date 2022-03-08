import { replace_math } from "@cocalc/util/mathjax-utils";
import { MATH_TAGS } from "./parse-markdown";
import { math_unescape } from "@cocalc/util/markdown-utils";
import type { Token } from "./types";

export default function getSource(
  token: Token,
  lines: string[],
  math: string[]
): string {
  if (token.map == null) {
    throw Error("token.map must be set");
  }
  let markdown =
    lines.slice(token.map[0], token.map[1]).join("\n").replace(/\n+$/, "") +
    "\n\n";
  markdown = math_unescape(replace_math(markdown, math, MATH_TAGS));
  return markdown;
}
