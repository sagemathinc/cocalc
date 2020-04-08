import { path_split } from "./misc2";

// NOTE: there are also .term files in subframes with history that doesn't get
// deleted.  That's an edge case.

// This *includes* path.
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

// This does NOT include {src,dest}.
export function move_file_variations(
  src: string,
  dest: string
): { src: string; dest: string }[] {
  let { head, tail } = path_split(src);
  if (head != "") {
    head = head + "/";
  }
  const d = path_split(dest);
  if (d.head != "") {
    d.head = d.head + "/";
  }
  const variations: { src: string; dest: string }[] = [];
  for (const ext of [
    "sage-chat",
    "sage-jupyter",
    "sage-jupyter2",
    "time-travel",
    "sage-history",
  ]) {
    variations.push({
      src: head + "." + tail + "." + ext,
      dest: d.head + "." + d.tail + "." + ext,
    });
  }
  return variations;
}
