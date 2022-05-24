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
  cache[stringify(node)] = markdown;
}
