import {
  describe,
  before,
  after,
  it,
  expect,
  TestEditor
} from "../../frame-editors/generic/test/util";
/*
import { JupyterStore } from "../store";
import { JupyterActions } from "../actions";
*/

describe("Jupyter - testing the tests", function() {
  this.timeout(10000);
  it("1 + 1 = 2", async () => {
    expect(eval("1+1")).to.equal(2);
  });
});

describe("Jupyter - testing a single action", function() {
  this.timeout(10000);
  let editor: TestEditor;
  before(async function() {
    editor = new TestEditor("ipynb");
    await editor.wait_until_loaded();
  });
  after(function() {
    editor.delete();
  });
  it("list kernels", async () => {
    expect(eval("1+1")).to.equal(2);
    /*
    const actions: JupyterActions = editor.actions;
    const kernels = await new Promise(resolve => {
      return actions.fetch_jupyter_kernels();
      setTimeout(resolve, 1000);
    });
    console.log("KERNELS", kernels);
    */
  });
});

describe("Jupyter - testing a store function", function() {
  this.timeout(10000);
  let editor: TestEditor;
  before(async function() {
    editor = new TestEditor("ipynb");
    await editor.wait_until_loaded();
  });
  after(function() {
    editor.delete();
  });
  it("list kernels", async () => {
    /*
    const store: JupyterStore = editor.store;
    await new Promise(resolve => {
      console.log(store.get_language_info());
      setTimeout(resolve, 1000);
    });
    */
  });
});
