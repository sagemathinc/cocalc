/*
Just run some very basic startup tests.
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
import { JupyterActions } from "../actions";

describe("tests the setup code -- ", () => {
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
  it("does nothing", () => {
    console.log("store = ", store);
    console.log("actions = ", actions);
  });
});

describe("tests basic use of store -- ", () => {
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
  it("sets something in the store", () => {
    actions.setState({ test: "value" } as any);
    expect(store.get("test" as any)).to.equal("value");
  });
  it("checks the mode got set", () =>
    expect(store.get("mode")).to.equal("escape"));
  it("checks there is exactly one cell", () =>
    expect(store.get("cells").size).to.equal(1));
  it("checks that cell_list has size 1", () =>
    expect(store.get("cell_list").size).to.equal(1));
  it("checks that cur_id is the initial cell", () =>
    expect(store.get("cur_id")).to.deep.equal(store.get("cell_list").get(0)));
  it("inserts a cell and sees that there are now 2", () => {
    actions.insert_cell(1);
    expect(store.get("cells").size).to.equal(2);
  });
});

describe("test cursors positions (a minimal not very good test) -- ", () => {
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
  let list: any; // TODO: type
  it("inserts a cell", () => {
    actions.insert_cell(1);
    list = store.get("cell_list").toJS();
    expect(list.length).to.equal(2);
  });
  it("sets cursor locs", async () => {
    actions.set_cur_id(list[0]);
    actions.set_mode("edit");
    await new Promise((resolve) =>
      actions.syncdb.once("cursor_activity", () => {
        const cursors = actions.syncdb.get_cursors().toJS();
        expect(cursors[actions._account_id].locs).to.deep.equal([
          { id: list[0], x: 0, y: 0 },
          { id: list[0], x: 2, y: 1 },
        ]);
        resolve();
      })
    );
    // hack so cursor saving enabled (add two fake users...)
    const doc = (actions.syncdb as any).doc; // doc is private
    doc._users.push(doc._users[0]);
    doc._users.push(doc._users[0]);
    actions.set_cursor_locs([
      { id: list[0], x: 0, y: 0 },
      { id: list[0], x: 2, y: 1 },
    ]);
  });
});
