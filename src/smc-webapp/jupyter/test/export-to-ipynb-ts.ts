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

import { export_to_ipynb } from "../export-to-ipynb";

describe("tests exporting the most basic ipynb file -- ", () => {
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
  it("by directly calling export_to_ipynb", () => {
    const ipynb = export_to_ipynb({
      cell_list: actions.store.get("cell_list"),
      cells: actions.store.get("cells"),
      kernelspec: {}
    });
    expect(ipynb).to.deep.equal({
      cells: [
        {
          cell_type: "code",
          execution_count: 0,
          metadata: { collapsed: false },
          outputs: [],
          source: []
        }
      ],
      metadata: { kernelspec: {} },
      nbformat: 4,
      nbformat_minor: 0
    });
  });
  it("by calling function in the store", () => {
    const ipynb = export_to_ipynb({
      cell_list: actions.store.get("cell_list"),
      cells: actions.store.get("cells")
    });
    expect(store.get_ipynb()).to.deep.equal(ipynb);
  });
  it("modifies the cell and exports", () => {
    const id = store.get("cur_id");
    actions.set_cell_input(id, "a=2\nb=3\na+b");
    actions.set_cell_output(id, { 0: { data: { "text/plain": "5" } } });
    const ipynb = export_to_ipynb({
      cell_list: actions.store.get("cell_list"),
      cells: actions.store.get("cells"),
      kernelspec: {}
    });
    expect(ipynb).to.deep.equal({
      cells: [
        {
          cell_type: "code",
          source: ["a=2\n", "b=3\n", "a+b"],
          metadata: { collapsed: false },
          execution_count: 0,
          outputs: [
            {
              data: { "text/plain": ["5"] },
              output_type: "execute_result",
              metadata: {},
              execution_count: 0
            }
          ]
        }
      ],
      metadata: { kernelspec: {} },
      nbformat: 4,
      nbformat_minor: 0
    });
  });
});

describe("tests exporting a file with many cells -- ", () => {
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
  it("adds more cells and set input to id so we can test later", () => {
    for (let i = 0; i < 10; i++) {
      actions.insert_cell(-1);
      actions.insert_cell(1);
    }
    const cell_list = store.get("cell_list");
    if (cell_list != null) {
      cell_list.toJS().map(id => actions.set_cell_input(id, id));
    }
  });
  it("exports and confirms order is right", () => {
    const ipynb = store.get_ipynb();
    if (ipynb == null) throw Error("must be defined");
    const inputs = ipynb.cells.map(cell => cell.source[0]);
    const cell_list = store.get("cell_list");
    expect(inputs).to.deep.equal(cell_list != null && cell_list.toJS());
  });
});

describe("tests simple use of more_output ", () => {
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
  it("sets a more_output message", () => {
    const id = store.get("cur_id");
    actions.set_cell_output(id, { 0: { more_output: true } });
  });
  it("tests that export removes and replaces by error", () => {
    const ipynb = store.get_ipynb();
    if (ipynb == null) throw Error("must be defined");
    expect(ipynb.cells[0].outputs).to.deep.equal([
      {
        name: "stderr",
        output_type: "stream",
        text: ["WARNING: Some output was deleted.\n"]
      }
    ]);
  });
  it("tests when there is more than one message", () => {
    const id = store.get("cur_id");
    actions.set_cell_output(id, {
      0: { data: { "text/plain": "5" } },
      1: { data: { "text/plain": "2" } },
      2: { more_output: true }
    });
    const ipynb = store.get_ipynb();
    if (ipynb == null) throw Error("must be defined");
    expect(ipynb.cells[0].outputs[2]).to.deep.equal({
      name: "stderr",
      output_type: "stream",
      text: ["WARNING: Some output was deleted.\n"]
    });
  });
});

describe("tests exporting custom metadata -- ", () => {
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
  it("sets custom metadata", () => {
    actions.setState({ metadata: { custom: { data: 389 } } });
  });
  it("exports and checks it is there", () => {
    const ipynb = store.get_ipynb();
    if (ipynb == null) throw Error("must be defined");
    expect(ipynb.metadata.custom).to.deep.equal({ data: 389 });
  });
});
