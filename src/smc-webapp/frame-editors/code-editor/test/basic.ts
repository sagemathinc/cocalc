/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  TestEditor,
  describe,
  before,
  after,
  it,
  expect,
  eventually,
} from "../../generic/test/util";

const CONTENT = "This is some text.\nThis is also text.";

describe("CodeEditor - basic tests", function () {
  this.timeout(10000);

  let editor;

  before(async function () {
    editor = new TestEditor("txt");
    await editor.wait_until_loaded();
  });

  after(function () {
    editor.delete();
  });

  describe("open file, set content, and save to disk", function () {
    it("sets the content", function () {
      editor.actions.set_cm_value(CONTENT);
    });

    it("verifies editor content is set", function () {
      expect(editor.actions._get_cm_value()).to.equal(CONTENT);
    });

    it("syncstring gets set", async function () {
      await eventually(
        function () {
          expect(editor.actions._get_syncstring_value()).to.equal(CONTENT);
        },
        3000,
        "waiting for syncstring"
      );
    });

    it("saves the file to disk", async function () {
      editor.actions.update_save_status();
      editor.actions.save();
      await editor.wait_until_store((s) => !s.get("has_unsaved_changes"));
    });

    it("reads the file back", async function () {
      expect(await editor.read_file_from_disk()).to.equal(CONTENT);
    });

    it("deletes the file", function () {
      editor.delete();
    });
  });
});
