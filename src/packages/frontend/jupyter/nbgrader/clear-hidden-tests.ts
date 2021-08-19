/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Port to Typescript of what this does:
     nbgrader/nbgrader/preprocessors/clearhiddentests.py
*/

import { Map } from "immutable";

const begin_hidden_tests_delimiter = "BEGIN HIDDEN TESTS";

const end_hidden_tests_delimiter = "END HIDDEN TESTS";

/*
Find a region in the cell's input that is delimeted by
`begin_hidden_tests_delimiter` and `end_hidden_tests_delimiter`.
Remove that region depending the cell type.

Returns undefined if nothing changed; otherwise, returns the new input.
*/
function replace_hidden_tests_region(input: string): string | undefined {
  const lines: string[] = input.split("\n");
  const new_lines: string[] = [];
  let in_test: boolean = false;
  let replaced_test: boolean = false;

  for (const line of lines) {
    // begin the test area
    if (line.indexOf(begin_hidden_tests_delimiter) != -1) {
      // check to make sure this isn't a nested BEGIN HIDDEN TESTS region
      if (in_test)
        throw Error(
          "encountered nested begin hidden tests statement, which is not allowed"
        );

      in_test = true;
      replaced_test = true;
      // remove = do nothing
    }

    // end the test area
    else if (line.indexOf(end_hidden_tests_delimiter) != -1) {
      in_test = false;
    }
    // add lines as long as it's not in the test area
    else if (!in_test) {
      new_lines.push(line);
    }
  }

  // we finished going through all the lines, but didn't find a
  // matching END HIDDEN TESTS statment
  if (in_test) {
    throw Error("no matching END HIDDEN TESTS found");
  }

  // replace the area?
  if (replaced_test) {
    return new_lines.join("\n");
  }
}

export function clear_hidden_tests(cell: Map<string, any>): Map<string, any> {
  // Clear the hidden region in the input part of the cell, and returns
  // a new modified cell object if necessary.  You can tell whether or not
  // the cell was changed by using === on the immutable Map.
  const input = cell.get("input");
  if (typeof input != "string") return cell;
  const input2: string | undefined = replace_hidden_tests_region(input);
  return input2 != null ? cell.set("input", input2) : cell;
}

/* Mutate the ipynb JSON object to remove hidden tests from the input *and* ouptut of cells.
   This is done before returning work to students but after grading.
*/
export function ipynb_clear_hidden_tests(ipynb: object): void {
  const cells = ipynb["cells"];
  if (cells == null) return;
  for (const cell of cells) {
    const source = cell["source"];
    if (source == null) continue;
    const r = replace_hidden_tests_region(source.join(""));
    if (r == null) continue; // no hidden tests here
    cell["source"] = r.split("\n").map((line) => line + "\n");
    // Tracebacks, etc., in output might also expose hidden tests, so we remove those.
    const outputs = cell["outputs"];
    if (outputs == null) continue;
    cell["outputs"] = outputs.map((x) =>
      JSON.stringify(x).indexOf(begin_hidden_tests_delimiter) == -1
        ? x
        : {
            name: "stderr",
            output_type: "stream",
            text: ["A HIDDEN TEST failed"],
          }
    );
  }
}
