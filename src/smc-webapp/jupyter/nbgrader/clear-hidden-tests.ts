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
