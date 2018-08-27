/*
Tests of editing the cells in a notebook
*/
import {
  describe,
  before,
  after,
  it,
  expect,
  TestEditor
} from "../../frame-editors/generic/test/util";
import { JupyterStore } from "../store";
import { JupyterActions } from "../actions";

describe("test setting cell type -- ", () => {
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
  it("creates three cells", () => {
    actions.insert_cell(1);
    actions.insert_cell(1);
    expect(store.get("cells").size).to.equal(3);
  });
  it("sets the type of the first to markdown", () => {
    const id = store.get("cell_list").get(0);
    actions.set_cell_type(id, "markdown");
    expect(store.getIn(["cells", id, "cell_type"])).to.equal("markdown");
  });
  it("sets the type of the second to code", () => {
    const id = store.get("cell_list").get(1);
    actions.set_cell_type(id, "code");
    expect(store.getIn(["cells", id, "cell_type"])).to.equal("code");
    // first is still markdown
    expect(
      store.getIn(["cells", store.get("cell_list").get(0), "cell_type"])
    ).to.equal("markdown");
  });
  it("sets the type of the third to raw", () => {
    const id = store.get("cell_list").get(2);
    actions.set_cell_type(id, "raw");
    expect(store.getIn(["cells", id, "cell_type"])).to.equal("raw");
  });
  it("anything else is an error", () => {
    try {
      const id = store.get("cell_list").get(2);
      actions.set_cell_type(id, "nonsense");
      expect(true).to.equal(false);
    } catch (e) {
      expect(`${e}`).to.equal(
        "Error: cell type (='nonsense') must be 'markdown', 'raw', or 'code'"
      );
    }
  });
});

describe("test setting cell type for multiple selected cells -- ", () => {
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
  it("creates three cells", () => {
    actions.insert_cell(1);
    actions.insert_cell(1);
    expect(store.get("cells").size).to.equal(3);
  });
  it("selects cells 1 and 2 (of the 3)", () => {
    const list = store.get("cell_list").toJS();
    actions.select_cell_range(list[1]);
    actions.set_selected_cell_type("markdown");
    const v = list.map(id => store.getIn(["cells", id, "cell_type"]));
    expect(v).to.deep.equal([undefined, "markdown", "markdown"]);
  });
});

describe("test clearing output of cells -- ", () => {
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

  let list: any;
  it("creates three cells", () => {
    actions.insert_cell(1);
    actions.insert_cell(1);
    list = store.get("cell_list").toJS();
    [0, 1, 2].map(i => actions.set_cell_output(list[i], [i]));
    // TODO: check cell outputs
  });
  it("clear last cell output (it is selected)", () => {
    actions.clear_selected_outputs();
    const v = list.map(id =>
      __guard__(store.getIn(["cells", id, "output"]), x => x.toJS())
    );
    expect(v).to.deep.equal([[0], [1], undefined]);
  });

  it("select first two cells and clear their output", () => {
    actions.set_cur_id(list[0]);
    actions.select_cell_range(list[1]);
    actions.clear_selected_outputs();
    const v = list.map(id =>
      __guard__(store.getIn(["cells", id, "output"]), x => x.toJS())
    );
    return expect(v).to.deep.equal([undefined, undefined, undefined]);
  });

  return it("set output again and clear all", () => {
    for (let i of [0, 1, 2]) {
      actions.set_cell_output(list[i], [i]);
    }
    actions.clear_all_outputs();
    const v = list.map(id =>
      __guard__(store.getIn(["cells", id, "output"]), x => x.toJS())
    );
    return expect(v).to.deep.equal([undefined, undefined, undefined]);
  });
});

//describe 'test collapsing output of cells -- ', ->

//describe 'test scrolling output of cells -- ', ->

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
