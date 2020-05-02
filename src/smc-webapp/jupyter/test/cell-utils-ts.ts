/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { describe, it, expect } from "../../frame-editors/generic/test/util";
import * as cell_utils from "../cell-utils";
import * as immutable from "immutable";

describe("tests computing positions_between -- ", () => {
  it("three integers", () => {
    const v = cell_utils.positions_between(0, 4, 3);
    expect(v).to.deep.equal([1, 2, 3]);
  });
  it("three integers with one negative", () => {
    const v = cell_utils.positions_between(-2, 2, 3);
    expect(v).to.deep.equal([-1, 0, 1]);
  });
  it("three equal intervals", () => {
    const v = cell_utils.positions_between(-2, 2.5, 3);
    expect(v).to.deep.equal([-0.875, 0.25, 1.375]);
  });
});

describe("generate many intervals and lengths at random --", () => {
  it("tries many random intervals", () => {
    for (let i = 0; i < 1000; i++) {
      const left = Math.random();
      const right = left + Math.random();
      const n = 2 + Math.floor(Math.random() * 100);
      const v = cell_utils.positions_between(left, right, n);
      expect(v.length).to.equal(n);
      expect(v[0] < v[n - 1]).to.equal(true);
    }
  });
});

describe("extreme cases -- ", () => {
  it("tests before bigger than after", () => {
    const v = cell_utils.positions_between(7, 3, 3);
    expect(v).to.deep.equal([4, 5, 6]);
  });
  it("tests before not defined", () => {
    const v = cell_utils.positions_between(undefined, 3, 3);
    expect(v).to.deep.equal([0, 1, 2]);
  });
  it("tests after not defined", () => {
    const v = cell_utils.positions_between(0, undefined, 3);
    expect(v).to.deep.equal([1, 2, 3]);
  });
  it("neither defined", () => {
    const v = cell_utils.positions_between(undefined, undefined, 3);
    expect(v).to.deep.equal([0, 1, 2]);
  });
});

describe("tests computing the sorted list of cell ids -- ", () => {
  it("a first simple test with two cells", () => {
    const cells = immutable.fromJS({ abc: { pos: 1 }, xyz: { pos: -1 } });
    const cell_list = cell_utils.sorted_cell_list(cells);
    expect(immutable.List.isList(cell_list)).to.equal(true);
    expect(cell_list.toJS()).to.deep.equal(["xyz", "abc"]);
  });
  it("test with 5 cells", () => {
    const cells = immutable.fromJS({
      abc: { pos: 1 },
      xyz: { pos: -1 },
      a5: { pos: -10 },
      b7: { pos: 11 },
      x: { pos: 0 },
    });
    const cell_list = cell_utils.sorted_cell_list(cells);
    expect(cell_list.toJS()).to.deep.equal(["a5", "xyz", "x", "abc", "b7"]);
  });
});

describe("test code for ensuring positions are unique -- ", () => {
  it("test with undefined input", () => {
    expect(cell_utils.ensure_positions_are_unique()).to.equal(undefined);
  });
  it("test with distinct pos", () => {
    const cells = immutable.fromJS({ abc: { pos: 1 }, xyz: { pos: -1 } });
    expect(cell_utils.ensure_positions_are_unique(cells)).to.equal(undefined);
  });
  it("test with non-distinct pos", () => {
    const cells = immutable.fromJS({
      abc: { pos: 1 },
      xyz: { pos: -1 },
      qaz: { pos: 1 },
    });
    expect(cell_utils.ensure_positions_are_unique(cells)).to.deep.equal({
      abc: 1,
      qaz: 2,
      xyz: 0,
    });
  });
});

describe("test new_cell_pos -- ", () => {
  it("test a real insert in the middle", () => {
    const cells = immutable.fromJS({ abc: { pos: 1 }, xyz: { pos: -1 } });
    const cell_list = cell_utils.sorted_cell_list(cells);
    expect(cell_utils.new_cell_pos(cells, cell_list, "xyz", 1)).to.equal(0);
  });
  it("test a real insert in the beginning above", () => {
    const cells = immutable.fromJS({ abc: { pos: 1 }, xyz: { pos: -1 } });
    const cell_list = cell_utils.sorted_cell_list(cells);
    expect(cell_utils.new_cell_pos(cells, cell_list, "xyz", -1)).to.equal(-2);
  });
  it("test a real insert at the end below", () => {
    const cells = immutable.fromJS({ abc: { pos: 1 }, xyz: { pos: -1 } });
    const cell_list = cell_utils.sorted_cell_list(cells);
    expect(cell_utils.new_cell_pos(cells, cell_list, "abc", 1)).to.equal(2);
  });
});

describe("test move_selected_cells --", () => {
  it("some undef cases", () => {
    expect(cell_utils.move_selected_cells()).to.equal(undefined);
    expect(cell_utils.move_selected_cells(["a", "b", "x"])).to.equal(undefined);
    expect(
      cell_utils.move_selected_cells(["a", "b", "x"], { a: true })
    ).to.equal(undefined);
    expect(
      cell_utils.move_selected_cells(["a", "b", "x"], { a: true }, 0)
    ).to.equal(undefined);
    expect(
      cell_utils.move_selected_cells(["a", "b", "x"], { a: true }, 10)
    ).to.equal(undefined); // since moves out of doc
    expect(cell_utils.move_selected_cells(["a", "b", "x"], {}, 1)).to.equal(
      undefined
    );
  });
  it("some cases with 1 selected", () => {
    expect(
      cell_utils.move_selected_cells(["a", "b", "x"], { a: true }, 1)
    ).to.deep.equal(["b", "a", "x"]);
    expect(
      cell_utils.move_selected_cells(["a", "b", "x"], { a: true }, 2)
    ).to.deep.equal(["b", "x", "a"]);
  });
  it("some cases with 2 selected", () => {
    expect(
      cell_utils.move_selected_cells(["a", "b", "x"], { a: true, b: true }, 1)
    ).to.deep.equal(["x", "a", "b"]);
    expect(
      cell_utils.move_selected_cells(["a", "b", "x"], { b: true, x: true }, -1)
    ).to.deep.equal(["b", "x", "a"]);
  });
});
