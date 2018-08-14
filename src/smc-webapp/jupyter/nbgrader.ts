//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2018, SageMath, Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

/*
Functionality that mimics aspects of nbgrader
*/

const { JupyterActions } = require("./actions");
const { JupyterStore } = require("./store");
const { DEBUG } = require("../feature");

// const misc = require("smc-util/misc");
const md5 = require("md5");
const immutable = require("immutable");
import { Map as ImmutableMap } from "immutable";

// some issue with the empty string … ?
export type MODES = "" | "manual" | "solution" | "tests" | "readonly";

// export const CELL_TYPES = ImmutableMap<CELL_NAMES, string>({
export const CELL_TYPES = ImmutableMap({
  "": "-",
  manual: "Manually graded answer",
  solution: "Autograded answer",
  tests: "Autograder test",
  readonly: "Read-only"
});

// compute the checksum of a cell just like nbgrader does
// utils.compute_checksum is here https://github.com/jupyter/nbgrader/blob/master/nbgrader/utils.py#L92

export const is_grade = cell =>
  // Returns True if the cell is a grade cell.
  !!__guard__(
    cell.metadata != null ? cell.metadata.nbgrader : undefined,
    x => x.grade
  );

export const is_solution = cell =>
  // Returns True if the cell is a solution cell.
  !!__guard__(
    cell.metadata != null ? cell.metadata.nbgrader : undefined,
    x => x.solution
  );

const is_locked = function(cell) {
  // Returns True if the cell source is locked (will be overwritten).
  if ((cell.metadata != null ? cell.metadata.nbgrader : undefined) == null) {
    return false;
  }
  if (is_solution(cell)) {
    return false;
  }
  if (is_grade(cell)) {
    return true;
  }
  return !!__guard__(
    cell.metadata != null ? cell.metadata.nbgrader : undefined,
    x => x.locked
  );
};

const to_bytes = s =>
  // string to utf-8 encoded byte vector or whatever ...
  `${s}`;

const compute_checksum = function(cell) {
  // m = hashlib.md5()
  //
  // * add the cell source and type
  //
  // m.update(to_bytes(cell.source))
  // m.update(to_bytes(cell.cell_type))
  // * add whether it's a grade cell and/or solution cell
  //
  // m.update(to_bytes(str(is_grade(cell))))
  // m.update(to_bytes(str(is_solution(cell))))
  // m.update(to_bytes(str(is_locked(cell))))
  // * include the cell id
  //
  // m.update(to_bytes(cell.metadata.nbgrader['grade_id']))
  // * include the number of points that the cell is worth, if it is a grade cell
  //
  // if is_grade(cell):
  //     m.update(to_bytes(str(float(cell.metadata.nbgrader['points']))))
  // return m.hexdigest()
  const l = is_locked(cell);
  return md5(`0xNOTIMPLEMENTED ${l}`);
};

/*

nbgrader metadata fields (4 types)

manually graded answer, 3 points

  "nbgrader": {
    "schema_version": 1,
    "solution": true,
    "grade": true,
    "locked": false,
    "points": 3,
    "grade_id": "cell-a1baa9e8d10a4e0b"
  }

autograded answer

  "nbgrader": {
    "schema_version": 1,
    "solution": true,
    "grade": false,
    "locked": false,
    "grade_id": "cell-1509e19eff29d205"
  }

autograder test, 2 points

  "nbgrader": {
    "schema_version": 1,
    "solution": false,
    "grade": true,
    "locked": true,
    "points": 2,
    "grade_id": "cell-058f430d8dbb7c79"
  }

read only

  "nbgrader": {
    "schema_version": 1,
    "solution": false,
    "grade": false,
    "locked": true,
    "grade_id": "cell-4301bc9b1c3e88b1"
  }

*/

/* ACTIONS */

interface IData {
  schema_version: 1;
  grade_id: string;
  solution?: boolean;
  grade?: boolean;
  locked?: boolean;
  points?: number;
}

JupyterActions.prototype.nbgrader_set_cell_type = function(id, val) {
  const data: IData = {
    schema_version: 1,
    grade_id: `cell-${id}`
  };
  switch (val) {
    case "manual":
      data.solution = true;
      data.grade = true;
      data.locked = false;
      data.points = 1;
      break;
    case "solution":
      data.solution = true;
      data.grade = false;
      data.locked = false;
      break;
    case "tests":
      data.solution = false;
      data.grade = true;
      data.locked = true;
      data.points = 1;
      break;
    case "readonly":
      data.solution = false;
      data.grade = false;
      data.locked = true;
      break;
    default:
      this.nbgrader_delete_data(id);
      return;
  }

  return this.nbgrader_set_data(id, immutable.fromJS(data));
};

JupyterActions.prototype.nbgrader_set_data = function(id, data) {
  // TODO: this should be merge = true, or just set the nbgrader field, and not touch the other ones
  if (DEBUG) {
    console.log("JupyterActions::nbgrader_set_data", id, data.toJS());
  }
  return this.set_cell_metadata({
    id: id,
    metadata: { nbgrader: data.toJS() }
  });
};

JupyterActions.prototype.nbgrader_delete_data = function(id) {
  // get rid of the nbgrader metadata
  let metadata = this.store.getIn(["cells", id, "metadata"]);
  metadata = metadata.delete("nbgrader");
  return this.set_cell_metadata({ id: id, metadata: metadata.toJS() });
};

JupyterActions.prototype.nbgrader_set_points = function(id, num) {
  let data = this.store.get_nbgrader(id);
  data = data.set("grade", num);
  return this.nbgrader_set_data(data.toJS());
};

JupyterActions.prototype.nbgrader_run_tests = function() {
  this.store
    .get("cell_list")
    .filter(id => {
      let type = this.store.get_nbgrader_cell_type(id);
      return type == "tests";
    })
    .forEach(id => {
      this.run_cell(id);
    });
  return this.save_asap();
};

JupyterActions.prototype.nbgrader_detect = function() {
  const cells = this.store.get("cells");
  if (cells == null) {
    return;
  }
  let any_nbgrader_cells = cells.some(cell => {
    return cell.getIn(["metadata", "nbgrader"]) != null;
  });
  this.setState({ any_nbgrader_cells });
};

/* STORE */

JupyterStore.prototype.get_nbgrader = (id: string) => {
  return this.getIn(["cells", id, "metadata", "nbgrader"]);
};

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
