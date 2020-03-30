import { path_split } from "./misc2";

// NOTE: there are also .term files in subframes with history that doesn't get
// deleted.  That's an edge case.

export function deleted_file_variations(path: string): string[] {
  let { head, tail } = path_split(path);
  if (head != "") {
    head = head + "/";
  }
  const variations: string[] = [path];
  for (const ext of [
    "sage-chat",
    "sage-jupyter",
    "sage-jupyter2",
    "time-travel",
    "sage-history",
  ]) {
    variations.push(head + "." + tail + "." + ext);
  }
  return variations;
}
