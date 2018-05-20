/* Basic markdown editor tests. */

import {
  TestEditor,
  describe,
  it,
  expect,
  eventually
} from "../../generic/test/util";

// Some test data:
const CONTENT = "# Heading\n**Foo** and *bar*\n";
const RENDERED =
  "<h1>Heading</h1>\n<p><strong>Foo</strong> and <em>bar</em></p>";

describe("Markdown - basic tests", function() {
  describe("open file, set content, and save to disk", function() {
    this.timeout(3000);
    let editor;
    it("open a new markdown file", function() {
      editor = new TestEditor("md");
    });

    it("wait for the file to finishing loading", async function() {
      await editor.wait_until_loaded();
    });

    it("sets the content of the document", function() {
      editor.actions.set_cm_value(CONTENT);
    });

    it("verifies that the codemirror editor gets properly set", async function() {
      expect(editor.actions._get_cm_value()).to.equal(CONTENT);
    });

    // This really *should* take a few seconds, due to throttling.
    it("verifies that the syncstring gets properly set in response to setting the codemirror", async function() {
      await eventually(
        function() {
          expect(editor.actions._get_syncstring_value()).to.equal(CONTENT);
        },
        3000,
        "waiting for syncstring value to converge"
      );
    });

    it("verifies that the rendered markdown gets properly rendered", function() {
      const id: string = editor.store.getIn([
        "local_view_state",
        "frame_tree",
        "second",
        "id"
      ]);
      const rendered: string = editor.actions._get_frame_jquery(id).html();
      expect(rendered).to.have.string(RENDERED);
    });

    this.timeout(5000);
    it("saves the file to disk", async function() {
      editor.actions.update_save_status();
      editor.actions.save();
      await editor.wait_until_store(s => !s.get("has_unsaved_changes"));
    });

    it("reads the file back from disk and confirms contents are as they should be", async function() {
      expect(await editor.read_file_from_disk()).to.equal(CONTENT);
    });

    it("deletes the file", function() {
      editor.delete();
    });
  });
});
