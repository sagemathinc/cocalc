/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";

const begin_delimiter = "BEGIN MARK SCHEME";

const end_delimiter = "END MARK SCHEME";

/*
Find a region in the cell's input that is delimeted by
`begin_delimiter` and `end_delimiter`,
where we really mean that a line contains begin_delimiter
to start, and end_delimiter to end.
Remove that region depending the cell type.

Returns undefined if nothing changed; otherwise, returns the new input.
*/
// TODO: common code with hidden-tests...
function replace_mark_region(input: string): string | undefined {
  const lines: string[] = input.split("\n");
  const new_lines: string[] = [];
  let in_region: boolean = false;
  let replaced_region: boolean = false;

  for (const line of lines) {
    // begin the test area
    if (line.indexOf(begin_delimiter) != -1) {
      // check to make sure this isn't a nested BEGIN MARK SCHEME region
      if (in_region)
        throw Error(
          "encountered nested ${begin_delimiter}, which is not allowed"
        );

      in_region = true;
      replaced_region = true;
      // remove = do nothing
    }

    // end the test area
    else if (line.indexOf(end_delimiter) != -1) {
      in_region = false;
    }
    // add lines as long as it's not in the test area
    else if (!in_region) {
      new_lines.push(line);
    }
  }

  // we finished going through all the lines, but didn't find a
  // matching END statement
  if (in_region) {
    throw Error("no matching ${end_delimiter} found");
  }

  // replace the area?
  if (replaced_region) {
    return new_lines.join("\n");
  }
}

export function clear_mark_regions(cell: Map<string, any>): Map<string, any> {
  // Clear the hidden region in the input part of the cell, and returns
  // a new modified cell object if necessary.  You can tell whether or not
  // the cell was changed by using === on the immutable Map.
  const input = cell.get("input");
  if (typeof input != "string") return cell;
  const input2: string | undefined = replace_mark_region(input);
  return input2 != null ? cell.set("input", input2) : cell;
}
