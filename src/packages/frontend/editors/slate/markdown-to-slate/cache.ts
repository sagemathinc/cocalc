import stringify from "json-stable-stringify";
import { Descendant } from "slate";

export function setCache({
  cache,
  node,
  markdown,
}: {
  cache: { [node: string]: string } | undefined;
  node: Descendant;
  markdown: string | undefined;
}): void {
  if (cache == null || node == null || !markdown) return;
  const s = stringify(node);
  if (cache[s] !== undefined) {
    // Distinct markdown can result in the same slate element; in this case we cache
    // only the first. An example is the paragraph "_a_" versus "*a*", or different
    // notation for a displayed math equation.
    return;
  }
  cache[s] = markdown;
}
