/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Port to Typescript of what this does:
     nbgrader/nbgrader/preprocessors/clearsolutions.py

I tried to follow that code closely in order to best maintain
compatibility.  Of course, I couldn't help adding STUBS support
for more languages...
*/

import { Map } from "immutable";

const STUBS: { [language: string]: string[] } = {
  "c++": "// YOUR CODE HERE\nthrow NotImplementedError()".split("\n"),
  python: "# YOUR CODE HERE\nraise NotImplementedError()".split("\n"),
  sage: "# YOUR CODE HERE\nraise NotImplementedError()".split("\n"),
  r: `# YOUR CODE HERE\nstop("No Answer Given!")`.split("\n"),
  matlab: "% YOUR CODE HERE\nerror('No Answer Given!')".split("\n"),
  octave: "% YOUR CODE HERE\nerror('No Answer Given!')".split("\n"),
  java: ["// YOUR CODE HERE"],
  markdown: ["YOUR ANSWER HERE"],
};

const begin_solution_delimiter = "BEGIN SOLUTION";

const end_solution_delimiter = "END SOLUTION";

/*
replace_solution_region --
Find a region in the cell's input that is delimeted by
`begin_solution_delimiter` and `end_solution_delimiter` (e.g.
### BEGIN SOLUTION and ### END SOLUTION). Replace that region either
with the code stub or text stub, depending the cell type.

Returns undefined if nothing changed; otherwise, returns the new input.
*/
function replace_solution_region(
  input: string,
  language: string
): string | undefined {
  const lines: string[] = input.split("\n");

  if (STUBS[language] == null) {
    // unknown -- default to markdown
    language = "markdown";
  }
  if (STUBS[language] == null) throw Error("bug");
  const stub_lines: string[] = STUBS[language];

  const new_lines: string[] = [];
  let in_solution: boolean = false;
  let replaced_solution: boolean = false;

  for (const line of lines) {
    // begin the solution area
    if (line.indexOf(begin_solution_delimiter) != -1) {
      // check to make sure this isn't a nested BEGIN SOLUTION region
      if (in_solution)
        throw Error("encountered nested begin solution statements");

      in_solution = true;
      replaced_solution = true;

      // replace it with the stub, preserving leading whitespace
      const v = line.match(/\s*/);
      const indent: string = v != null ? v[0] : "";
      for (const stub_line of stub_lines) new_lines.push(indent + stub_line);
    }

    // end the solution area
    else if (line.indexOf(end_solution_delimiter) != -1) {
      in_solution = false;
    }
    // add lines as long as it's not in the solution area
    else if (!in_solution) {
      new_lines.push(line);
    }
  }

  // we finished going through all the lines, but didn't find a
  // matching END SOLUTION statment
  if (in_solution) {
    throw Error("no end solution statement found");
  }

  // replace the cell source
  if (replaced_solution) {
    return new_lines.join("\n");
  }
}

export function clear_solution(
  cell: Map<string, any>,
  kernel_language: string
): Map<string, any> {
  // Clear the solution region in the input part of the cell, and returns
  // a new modified cell object if necessary.  You can tell whether or not
  // the cell was changed by using === on the immutable Map.
  const input = cell.get("input");
  if (typeof input != "string") return cell;
  const cell_type = cell.get("cell_type", "code");
  const language: string = cell_type === "code" ? kernel_language : "markdown";
  const input2: string | undefined = replace_solution_region(input, language);
  return input2 != null ? cell.set("input", input2) : cell;
}
