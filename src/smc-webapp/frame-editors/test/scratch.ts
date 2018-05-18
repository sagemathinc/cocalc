/* Temporary mess to get a sense of how to test....  NOT structured yet! */

/* Goal:

Test opening a new markdown file test/<random>.md

Two frames appear, one cm and one markdown.

Inserting some content.

Preview of content appears in preview pane.

*/

import { expect } from "chai";
import { uuid } from "../generic/misc";
import { read_text_file_from_project } from "../generic/client";
import { init, clean_up, TestData } from "./util";
import { callback_opts } from "../generic/async-utils";

import { delay } from "awaiting";

const w = window as any;

w.test_init = init;

// hardcode for now... until we see how this is going to work.
const project_id: string = "98e85b9b-51bb-4889-be47-f42698c37ed4";

export function tests(describe: Function, it: Function): void {
  describe("Markdown - basic tests", function() {
    const path = `test/${uuid()}.md`;
    let data: TestData;
    const CONTENT = "# Heading\n**Foo** and *bar*\n";
    const RENDERED =
      "<h1>Heading</h1>\n<p><strong>Foo</strong> and <em>bar</em></p>";

    describe(`open a random new file "${path}" and verify the layout`, function() {
      it("opens the random file", function() {
        data = init(project_id, path);
      });

      it("wait for the file to finishing loading", async function() {
        await callback_opts(data.editor.store.wait)({
          until: s => s.get("is_loaded")
        });
      });

      it("sets the content of the document", function() {
        data.editor.actions._get_cm().setValue(CONTENT);
      });

      it("verifies that the codemirror editor gets properly set", function() {
        expect(data.editor.actions._get_cm().getValue()).to.equal(CONTENT);
      });

      this.timeout(5000);
      // This really *should* take about 2s, due to throttling.
      it("verifies that the syncstring gets properly set in response to setting the codemirror", async function() {
        while (data.editor.actions._syncstring.to_str() != CONTENT) {
          // console.log(`"${data.editor.actions._syncstring.to_str()}" versus "${CONTENT}"`);
          await delay(250);
        }
      });

      it("verifies that the rendered markdown gets properly rendered", function() {
        const id: string = data.editor.store.getIn([
          "local_view_state",
          "frame_tree",
          "second",
          "id"
        ]);
        const rendered: string = $(`#frame-${id}`).html();
        expect(rendered).to.have.string(RENDERED);
      });

      this.timeout(5000);
      it("saves the file to disk", async function() {
        data.editor.actions.update_save_status(); //
        data.editor.actions.save();
        await callback_opts(data.editor.store.wait)({
          until: s => !s.get("has_unsaved_changes")
        });
      });

      it("reads the file back from disk and confirms contents are as they should be", async function() {
        const file_on_disk: string = await read_text_file_from_project({
          project_id: project_id,
          path: path
        });
        expect(file_on_disk).to.equal(CONTENT);
      });

      it("closes and deletes the file", function() {
        clean_up(project_id, path);
      });
    });
  });
}
