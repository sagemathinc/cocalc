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
    // set_resize increments a counter that starts at 0.
    expect(editor.store.get("resize")).to.equal(0);
    editor.actions.set_resize();
    expect(editor.store.get("resize")).to.equal(1);
  });

  it("tests reset_local_view_state and set_local_view_state", function() {
    // reset_local_view_state() just rests to the default the localStorage
    // information about viewing this file.  We test this by setting a
    // random property, resetting, and observing it is gone.
    const local = editor.store.get("local_view_state");
    expect(local.get("foo")).to.not.exist;
    editor.actions.set_local_view_state({ foo: "bar" });
    expect(editor.store.getIn(["local_view_state", "foo"])).to.equal("bar");
    editor.actions.reset_local_view_state();
    expect(editor.store.getIn(["local_view_state", "foo"])).to.not.exist;
    // NOTE: the actual local_view_state is still different due to random editor
    // id's, which get generated:
    expect(local.equals(editor.store.get("local_view_state"))).to.equal(false);
  });

  it("tests save_editor_state", function() {});

  it("tests copy_editor_state", function() {});

  it("tests delete_trailing_whitespace", function() {
    editor.actions.set_cm_value("foo \nbar   \nnone");
    editor.actions.delete_trailing_whitespace();
    // does NOT delete the whitespace in line foo, since the cursor
    // is in the first line by default.
    expect(editor.actions._get_cm_value()).to.equal("foo \nbar\nnone");
  });
});
