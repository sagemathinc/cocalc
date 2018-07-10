/*
Tests of fronted part of complete functionality.
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

const misc = require("smc-util/misc");

describe("basic completion test -- ", () => {
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
  it("complete starts empty", () => {
    expect(store.get("complete")).to.equal(undefined);
  });
  it("clear complete increments counter", () => {
    actions.clear_complete();
    expect(actions._complete_request).to.equal(1);
  });
  it("do a complete", () => {
    // We mock the _ajax method so we can send
    // responses of our chosing instead of needing
    // backend server when testing.
    const resp = {
      matches: ["import"],
      cursor_start: 0,
      cursor_end: 2,
      status: "ok"
    };
    actions._ajax = opts => {
      return opts.cb(undefined, resp);
    };
    actions.complete("im");
    expect(store.get("complete").toJS()).to.deep.equal(
      misc.copy_without(resp, "status")
    );
  });
  it("do another complete with the cursor position specified (non-default)", () => {
    const resp = {
      matches: [
        "id",
        "if",
        "import",
        "in",
        "input",
        "int",
        "intern",
        "is",
        "isinstance",
        "issubclass",
        "iter"
      ],
      cursor_start: 0,
      cursor_end: 1,
      status: "ok"
    };
    actions._ajax = opts => {
      return opts.cb(undefined, resp);
    };
    actions.complete("im", 1);
    expect(store.get("complete").toJS()).to.deep.equal(
      misc.copy_without(resp, "status")
    );
  });
  it("do a completion, but cancel it before the callback, so result is ignored", () => {
    const resp = {
      matches: ["import"],
      cursor_start: 0,
      cursor_end: 2,
      status: "ok"
    };
    actions._ajax = opts => {
      actions.clear_complete();
      return opts.cb(undefined, resp);
    };
    actions.complete("im");
    expect(store.get("complete")).to.equal(undefined);
  });
  it("if there is an error doing the completion see an error result", () => {
    actions.setState({ complete: "foo" });
    actions._ajax = opts => {
      return opts.cb("error");
    };
    actions.complete("im");
    expect(store.get("complete").toJS()).to.deep.equal({
      error: "error"
    });
  });
  it("if there is a status not ok doing the completion see an error result", () => {
    actions.setState({ complete: "foo" });
    actions._ajax = opts => {
      return opts.cb(undefined, { status: "error" });
    };
    actions.complete("im");
    expect(store.get("complete").toJS()).to.deep.equal({
      error: "completion failed"
    });
  });
  it("launching a new complete request clears current complete value", () => {
    // TODO: make this async
    actions.setState({ complete: "foo" });
    actions._ajax = opts => {
      expect(store.get("complete")).to.equal(undefined);
      return opts.cb(true);
    };
    actions.complete("im");
  });
});

describe("edge cases completion tests -- ", () => {
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
  it("do a completion wih no results", () => {
    const resp = { matches: [], status: "ok", cursor_start: 0, cursor_end: 2 };
    actions.setState({ identity: "fake" });
    actions._ajax = opts => {
      return opts.cb(undefined, resp);
    };
    actions.complete("imasdlknaskdvnaidsfioahefhoiaioasdf");
    // it just stays undefined doing nothing
    expect(store.getIn(["complete", "matches"]).size).to.equal(0);
  });
  it("does a completion with 1 result, but with no id set (so nothing special happens)", () => {
    const resp = {
      matches: ["foo"],
      status: "ok",
      cursor_start: 0,
      cursor_end: 2
    };
    actions.setState({ identity: "fake" });
    actions._ajax = opts => {
      return opts.cb(undefined, resp);
    };
    actions.complete("fo");
    // it just stays undefined doing nothing
    const c = store.get("complete");
    expect(c != null && c.toJS()).to.deep.equal({
      base: "fo",
      code: "fo",
      cursor_end: 2,
      cursor_start: 0,
      id: undefined,
      matches: ["foo"],
      pos: undefined
    });
  });
  it("does a completion with 1 result with a cell id set, and verifies that it modifies that cell", async () => {
    const id = store.get("cell_list").get(0);
    actions.set_cell_input(id, "a = fo");
    const resp = {
      matches: ["foo"],
      status: "ok",
      cursor_start: 4,
      cursor_end: 6
    };
    actions.setState({ identity: "fake" });
    actions._ajax = opts => {
      return opts.cb(undefined, resp);
    };
    actions.complete("a = fo", 6, id);
    // Result should be to modify the cell, but not open completions info
    const c = store.get("complete");
    if (c != null) expect(c.toJS()).to.equal(undefined);
    // but this happens in the next time slice to avoid subtle cursor issues, so:
    expect(store.getIn(["cells", id, "input"])).to.equal("a = fo");
    return new Promise(resolve => {
      const f = () => {
        expect(store.getIn(["cells", id, "input"])).to.equal("a = foo");
        resolve();
      };
      setTimeout(f, 1);
    });
  });
});
