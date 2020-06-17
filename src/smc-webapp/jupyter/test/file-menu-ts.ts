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
import { JupyterActions } from "../actions";

describe("test file-->open -- ", function () {
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
  it("do the file open action", function () {
    actions.file_open();
    // TODO: fix this "as any"
    const store2 = (actions as any).redux.getProjectStore(
      store.get("project_id")
    );
    expect(store2.active_project_tab).to.equal("files");
  });
});
