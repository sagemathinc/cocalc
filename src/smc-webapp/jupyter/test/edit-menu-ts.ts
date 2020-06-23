/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Tests of editing the cells in a notebook
*/
import {
  describe,
  before,
  after,
  it,
  expect,
  TestEditor,
} from "../../frame-editors/generic/test/util";
import { JupyterStore } from "../store";
import { JupyterActions } from "../project-actions";

describe("tests inserting and deleting a cell -- ", () => {
  let editor: TestEditor;
  let store: JupyterStore;
  let actions: JupyterActions;
  before(async () => {
    editor = new TestEditor("ipynb");
    await editor.wait_until_loaded();
    store = editor.store;
    actions = editor.actions;
  });
  after(() => {
    editor.delete();
  });
  it("inserts a new cell", () => {
    actions.insert_cell(1);
    expect(store.get("cells").size).to.equal(2);
  });
  it("deletes the selected cell", () => {
    // TODO: what is this
    // const id = store.get("cur_id"); // id never got used
    store.get("cur_id");
    expect(store.get("cell_list").size).to.equal(2);
    actions.delete_selected_cells();
    expect(store.get("cell_list").size).to.equal(1);
  });
  it("verify consistency checks after deleting cell", () => {
    const cell_list = store.get("cell_list");
    expect(cell_list.get(0)).to.equal(store.get("cur_id"));
  });
  it("undo deleting that cell", () => {
    actions.undo();
    expect(store.get("cell_list").size).to.equal(2);
  });
  it("redo deleting that cell", () => {
    actions.redo();
    expect(store.get("cell_list").size).to.equal(1);
  });
  it("delete the only remaining cell", () => {
    const cell_list = store.get("cell_list");
    const id = store.get("cur_id");
    expect(cell_list.get(0)).to.equal(id);
    actions.set_cell_input(id, "xyz");
    actions.delete_selected_cells();
    let new_cell_list = store.get("cell_list");
    expect(new_cell_list.size).to.equal(0);
    actions.ensure_there_is_a_cell();
    new_cell_list = store.get("cell_list");
    expect(new_cell_list.size).to.equal(1);
    expect(store.getIn(["cells", new_cell_list.get(0), "input"])).to.equal("");
    expect(store.get("cur_id")).to.equal(new_cell_list.get(0));
  });
});

describe("tests inserting several cells, selecting several, and deleting all that are selected -- ", () => {
  let editor: TestEditor;
  let store: JupyterStore;
  let actions: JupyterActions;
  before(async () => {
    editor = new TestEditor("ipynb");
    await editor.wait_until_loaded();
    store = editor.store;
    actions = editor.actions;
  });
  after(() => {
    editor.delete();
  });
  it("inserts three new cells (for a total of 4)", () => {
    actions.insert_cell(1);
    actions.insert_cell(1);
    actions.insert_cell(1);
    expect(store.get("cells").size).to.equal(4);
  });
  /*
  it("select cells 0-2 with the current at position 0", () => {
    actions.set_cur_id(store.get("cell_list").get(0));
    actions.select_cell(store.get("cell_list").get(1));
    actions.select_cell(store.get("cell_list").get(2));
  });
  it("deletes selected cells leaving only cell 3", () => {
    const id = store.get("cell_list").get(3);
    actions.delete_selected_cells();
    expect(store.get("cell_list").toJS()).to.deep.equal([id]);
    expect(store.get("cur_id")).to.equal(id);
  });
  */
  it("undo deleting those 3 cells", () => {
    actions.undo();
    expect(store.get("cell_list").size).to.equal(4);
  });
  it("redo deleting those 3 cells", () => {
    actions.redo();
    expect(store.get("cell_list").size).to.equal(1);
  });
});

describe("tests inserting several cells, selecting several, and cut/paste/copy them -- ", () => {
  let editor: TestEditor;
  let store: JupyterStore;
  let actions: JupyterActions;
  before(async () => {
    editor = new TestEditor("ipynb");
    await editor.wait_until_loaded();
    store = editor.store;
    actions = editor.actions;
  });
  after(() => {
    editor.delete();
  });
  it("inserts four new cells (for a total of 5)", () => {
    actions.insert_cell(1);
    actions.insert_cell(1);
    actions.insert_cell(1);
    actions.insert_cell(1);
    return expect(store.get("cells").size).to.equal(5);
  });
  it("put content in the 5 cells", () => {
    const object = store.get("cell_list").toJS();
    for (const k in object) {
      const id = object[k];
      actions.set_cell_input(id, `${k}`);
    }
  });
  /*
  it("select cells 1-3 with the current at position 0", () => {
    const list = store.get("cell_list").toJS();
    actions.set_cur_id(list[1]);
    actions.select_cell(list[2]);
    actions.select_cell(list[3]);
  });
  it("cut selected cells leaving only 2 cells", () => {
    actions.cut_selected_cells();
    const list = store.get("cell_list").toJS();
    expect(list.length).to.equal(2);
    expect(store.get("cur_id")).to.equal(list[1]);
  });
  it("paste those 3 cells we just cut at the bottom, and verify content", () => {
    actions.paste_cells(1);
    const list = store.get("cell_list").toJS();
    const cells = store.get("cells");
    const v = list.map(id => cells.getIn([id, "input"]));
    expect(v).to.deep.equal(["0", "4", "1", "2", "3"]);
  });
  it("paste those 3 more in again at the very top", () => {
    actions.set_cur_id(store.get("cell_list").get(0));
    actions.paste_cells(-1);
    const list = store.get("cell_list").toJS();
    const cells = store.get("cells");
    const v = list.map(id => cells.getIn([id, "input"]));
    expect(v).to.deep.equal(["1", "2", "3", "0", "4", "1", "2", "3"]);
  });
  it("now change content of all cells, then copy/paste some, replacing target selection", () => {
    let id;
    let list = store.get("cell_list").toJS();
    for (let i in list) {
      id = list[i];
      actions.set_cell_input(id, `${i}`);
    }
    actions.set_cur_id(list[0]);
    actions.select_cell_range(list[3]); // 0,1,2,3
    actions.copy_selected_cells();

    let v = store
      .get_global_clipboard()
      .toJS()
      .map(x => x.input);
    expect(v).to.deep.equal(["0", "1", "2", "3"]);

    actions.set_cur_id(list[1]);
    actions.select_cell_range(list[list.length - 1]); // select all but first
    // paste replacing all but first.
    actions.paste_cells(0);
    list = store.get("cell_list").toJS();
    const cells = store.get("cells");

    const result: any[] = [];
    for (id of list) {
      result.push(cells.getIn([id, "input"]));
    }
    expect(result).to.deep.equal(["0", "0", "1", "2", "3"]);
  });*/
});

describe("creates and splits cells in various ways", () => {
  let editor: TestEditor;
  let store: JupyterStore;
  let actions: JupyterActions;
  before(async () => {
    editor = new TestEditor("ipynb");
    await editor.wait_until_loaded();
    store = editor.store;
    actions = editor.actions;
  });
  after(() => {
    editor.delete();
  });
  it("puts some input and output in a code cell then splits it", () => {
    const id = store.get("cur_id");
    actions.set_cell_input(id, "abc123");
    actions.set_cell_output(id, [{ foo: "bar" }]);
    actions.set_cursor_locs([{ id, x: 3, y: 0 }]);
    actions.split_current_cell();
  });
  it("checks that there are now 2 cells and they have the right content", () => {
    const list = store.get("cell_list");
    expect(list.size).to.equal(2);
    expect(store.getIn(["cells", list.get(0), "input"])).to.equal("abc");
    expect(store.getIn(["cells", list.get(0), "output"])).to.equal(undefined);
    expect(store.getIn(["cells", list.get(1), "input"])).to.equal("123");
    expect(store.getIn(["cells", list.get(1), "output"]).toJS()).to.deep.equal([
      { foo: "bar" },
    ]);
  });
  it("verifies that cursor is now in the second cell", () =>
    expect(store.get("cur_id")).to.equal(store.get("cell_list").get(1)));
  it("puts several lines of content in first cell, then splits it in the middle", () => {
    const id = store.get("cell_list").get(0);
    actions.set_cur_id(id);
    actions.set_cell_input(id, "a1\nb2\nc3\nd4");
    actions.set_cursor_locs([{ id, x: 1, y: 1 }]); // cursor is between b and 2 above.
    actions.split_current_cell();
    const list = store.get("cell_list");
    expect(list.size).to.equal(3);
    expect(store.getIn(["cells", list.get(0), "input"])).to.equal("a1\nb");
    expect(store.getIn(["cells", list.get(1), "input"])).to.equal("2\nc3\nd4");
  });
  it("puts several lines of content in first cell, makes it a markdown cell, then splits it at very top", () => {
    const id = store.get("cell_list").get(0);
    actions.set_cur_id(id);
    actions.set_cell_type(id, "markdown");
    actions.set_cell_input(id, "# foo\n- bar\n-stuff");
    actions.set_cursor_locs([{ id, x: 0, y: 0 }]); // cursor is at very start
    actions.split_current_cell();
    const list = store.get("cell_list");
    expect(list.size).to.equal(4);
    expect(store.getIn(["cells", list.get(0), "input"])).to.equal("");
    expect(store.getIn(["cells", list.get(1), "input"])).to.equal(
      "# foo\n- bar\n-stuff"
    );
    expect(store.getIn(["cells", list.get(0), "cell_type"])).to.equal(
      "markdown"
    );
    expect(store.getIn(["cells", list.get(1), "cell_type"])).to.equal(
      "markdown"
    );
  });
});

describe("merge cell with cell above", () => {
  let editor: TestEditor;
  let store: JupyterStore;
  let actions: JupyterActions;
  before(async () => {
    editor = new TestEditor("ipynb");
    await editor.wait_until_loaded();
    store = editor.store;
    actions = editor.actions;
  });
  after(() => {
    editor.delete();
  });
  it("puts some input in a code cell then splits it", () => {
    const id = store.get("cur_id");
    actions.set_cell_input(id, "abc123");
    actions.set_cursor_locs([{ id, x: 3, y: 0 }]);
    actions.split_current_cell();
  });
  /*  it("now merge cells back together above", () => {
    actions.merge_cell_above();
    const list = store.get("cell_list");
    expect(list.size).to.equal(1);
    expect(store.getIn(["cells", list.get(0), "input"])).to.equal("abc\n123");
  });*/
});

describe("merge cell with cell below", () => {
  let editor: TestEditor;
  let store: JupyterStore;
  let actions: JupyterActions;
  before(async () => {
    editor = new TestEditor("ipynb");
    await editor.wait_until_loaded();
    store = editor.store;
    actions = editor.actions;
  });
  after(() => {
    editor.delete();
  });
  it("puts some input in a code cell then splits it", () => {
    const id = store.get("cur_id");
    actions.set_cell_input(id, "abc123");
    actions.set_cursor_locs([{ id, x: 3, y: 0 }]);
    actions.split_current_cell();
  });
  /*
  it("now merge cells back together below", () => {
    actions.set_cur_id(store.get("cell_list").get(0));
    actions.merge_cell_below();
    const list = store.get("cell_list");
    expect(list.size).to.equal(1);
    expect(store.getIn(["cells", list.get(0), "input"])).to.equal("abc\n123");
  });*/
});

describe("inserting a cell in various ways", () => {
  let editor: TestEditor;
  let store: JupyterStore;
  let actions: JupyterActions;
  before(async () => {
    editor = new TestEditor("ipynb");
    await editor.wait_until_loaded();
    store = editor.store;
    actions = editor.actions;
  });
  after(() => {
    editor.delete();
  });
  it("inserts a cell after default first cell", () => {
    const id = store.get("cur_id");
    actions.set_cell_input(id, "cell 0");
    actions.insert_cell(1);
    const list = store.get("cell_list");
    expect(list.size).to.equal(2);
    expect(list.get(0)).to.equal(id);
    expect(store.get("cur_id")).to.equal(list.get(1));
    expect(store.getIn(["cells", list.get(0), "input"])).to.equal("cell 0");
    expect(store.getIn(["cells", list.get(1), "input"])).to.equal("");
  });
  it("inserts another cell after first cell", () => {
    let list = store.get("cell_list");
    actions.set_cur_id(list.get(0));
    actions.set_cell_input(list.get(1), "cell 1");
    actions.insert_cell(1);
    list = store.get("cell_list");
    expect(list.size).to.equal(3);
    expect(store.get("cur_id")).to.equal(list.get(1));
    expect(store.getIn(["cells", list.get(1), "input"])).to.equal("");
    actions.set_cell_input(list.get(2), "cell 2");
    actions.set_cur_id(list.get(2));
  });
  it("inserts a cell before the last cell", () => {
    actions.insert_cell(-1);
    const list = store.get("cell_list");
    expect(list.size).to.equal(4);
    expect(store.get("cur_id")).to.equal(list.get(2));
    expect(store.getIn(["cells", list.get(2), "input"])).to.equal("");
    actions.set_cur_id(list.get(0));
  });
  it("inserts a new cell before the first cell", () => {
    actions.insert_cell(-1);
    const list = store.get("cell_list");
    expect(list.size).to.equal(5);
    expect(store.getIn(["cells", list.get(0), "input"])).to.equal("");
    expect(store.getIn(["cells", list.get(1), "input"])).to.equal("cell 0");
  });
});
