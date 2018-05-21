/* Systematically testing lots of actions */

import {
  TestEditor,
  describe,
  before,
  after,
  it,
  expect
} from "../../generic/test/util";

describe("CodeEditor - testing actions...", function() {
  this.timeout(5000);
  let editor;

  before(async function() {
    editor = new TestEditor("txt");
    await editor.wait_until_loaded();
  });

  after(function() {
    editor.delete();
  });

  it("tests set_reload", async function() {
    // initially an empty Map
    expect(editor.store.get("reload").size).to.equal(0);
    editor.actions.set_reload("foo");
    // it is 0, because the doc equals ''.
    expect(editor.store.getIn(["reload", "foo"])).to.equal(0);
    // change the doc to something else and save to disk.
    editor.actions.set_cm_value("blah blah");
    editor.actions.set_syncstring_to_codemirror();
    await editor.actions._do_save();
    editor.actions.set_reload("foo");
    expect(editor.store.getIn(["reload", "foo"])).to.equal(1406598848);
  });

  it("tests set_resize", function() {

  });

});
