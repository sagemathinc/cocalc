/**
 * The text string contains markdown text with code blocks. This split this into cells of type markdown and code.
 *
 * TODO: cocalc has a markdown parser and is very good at parsing markdown (e.g., slate uses that),
 * and we should obviously using that instead of an adhoc parsing that will break on some inputs,
 * e.g., triple backticks is not ALWAYS the code delimiter (it can be spaces, it can be more than 3
 * backticks).
 */
export function splitCells(
  text: string,
  ignoreLine?: (line: string) => boolean, // first such line is ignored
): { cell_type: "markdown" | "code"; source: string[] }[] {
  const ret: { cell_type: "markdown" | "code"; source: string[] }[] = [];

  let lines = text.split("\n");
  let cell_type: "markdown" | "code" = "markdown";
  let source: string[] = [];
  let ignored = false;

  for (const line of lines) {
    if (!ignored && ignoreLine?.(line)) {
      ignored = true;
      continue;
    }
    if (line.startsWith("```")) {
      stripTrailingWhitespace(source);
      if (source.length > 0) {
        ret.push({ cell_type, source });
        source = [];
      }
      cell_type = cell_type === "markdown" ? "code" : "markdown";
    } else {
      source.push(`${line}\n`);
    }
  }

  stripTrailingWhitespace(source);
  if (source.length > 0) {
    ret.push({ cell_type, source });
  }

  return ret;
}

function stripTrailingWhitespace(source: string[]) {
  // remove trailing blank lines.
  let i = source.length - 1;
  while (i >= 0 && !source[i].trim()) {
    i -= 1;
    source.splice(-1); // deletes the last entry in place!
  }
  // also remove only trailing whitespace from last line
  if (source.length > 0) {
    source[source.length - 1] = source[source.length - 1].trimRight();
  }
}
