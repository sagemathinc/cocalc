/* Test rendering of math */

import {
  TestEditor,
  describe,
  it,
  expect,
  eventually
} from "../../generic/test/util";

describe("Markdown - test rendering of math", function() {
  this.timeout(5000);

  describe("open file, set various math content and observe the result", function() {
    let editor, id: string | undefined;
    it("get a file", async function() {
      editor = new TestEditor("md");
      await editor.wait_until_loaded();
      id = editor.store.getIn([
        "local_view_state",
        "frame_tree",
        "second",
        "id"
      ]);
      expect(id).to.exist;
    });

    it("sets the content of the file", function() {
      editor.actions.set_cm_value("$x^2$");
    });

    it("verifies that the codemirror editor gets properly set", async function() {
      expect(editor.actions._get_cm_value()).to.equal("$x^2$");
    });

    it("inspect rendered markdown", async function() {
      // This is just a partial test that katex maybe worked.
      await eventually(
        function() {
          const rendered: string = editor.actions._get_frame_jquery(id).html();
          expect(rendered).to.have.string(
            '<math><semantics><mrow><msup><mi>x</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math>'
          );
        },
        5000,
        "waiting for rendered markdown"
      );
    });

    it("deletes the file", function() {
      editor.delete();
    });
  });
});
