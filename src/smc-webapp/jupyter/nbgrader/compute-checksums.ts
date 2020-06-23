/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Port to Typescript of what this does:
     nbgrader/nbgrader/preprocessors/computechecksums.ts
     nbgrader/nbgrader/utils.py

We try to follow that code closely in order to best maintain compatibility.
*/

import { Map } from "immutable";
import * as md5 from "md5";

// Port of code from nbgrader/nbgrader/utils.py, for compatibility.
// Our goal is that we compute the same checksum as the official
// nbgrader scripts, because then things are more likely to work
// properly in case of mixing up tools...  Of course, they don't
// officially documentt the checksum in their manual, so perhaps
// this is subject to change.  I could maybe send a PR documenting this...
function compute_checksum(cell: Map<string, any>): string {
  let m: string = "";
  // add the cell source and type
  m += cell.get("input", "");
  m += cell.get("cell_type", "code");

  const nbgrader = cell.getIn(["metadata", "nbgrader"]);
  if (nbgrader == null)
    throw Error(
      "bug -- compute_checksum should only be called on nbgrader cells"
    );

  // add whether it's a grade cell and/or solution cell
  m += nbgrader.get("grade") ? "True" : "False";
  m += nbgrader.get("locked") ? "True" : "False";
  m += nbgrader.get("solution") ? "True" : "False";

  // include the cell id
  m += nbgrader.get("grade_id", "");

  // include the number of points that the cell is worth, if it is a grade cell
  if (nbgrader.get("grade")) {
    // worry - this is the sort of thing that Python and Javascript may do slightly differently...
    // At least we could try to get integerts to be the same.
    m += `${parseFloat(nbgrader.get("points"))}`;
  }

  return md5(m);
}

export function set_checksum(cell: Map<string, any>): Map<string, any> {
  let nbgrader = cell.getIn(["metadata", "nbgrader"]);
  if (
    nbgrader != null &&
    (nbgrader.get("grade") ||
      nbgrader.get("locked") ||
      nbgrader.get("solution"))
  ) {
    const checksum = compute_checksum(cell);
    nbgrader = nbgrader.set("checksum", checksum);
    nbgrader = nbgrader.set("cell_type", cell.get("cell_type"));
    cell = cell.set("nbgrader", nbgrader);
  }
  return cell;
}
