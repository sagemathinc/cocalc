/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { TestEditor, describe, it, expect } from "../../generic/test/util";

describe("CodeEditor - tests related to the format bar", function () {
  this.timeout(10000);

  describe("checks that there is no format bar when editing a txt file", function () {
    let editor;
    it("creates the editor", async function () {
      editor = new TestEditor("txt");
      await editor.wait_until_loaded();
    });
    it("checks that there is no format bar", function () {
      expect(
        $(".cc-frame-tree-editor").find(".cc-frame-tree-format-bar").length
      ).to.equal(0);
    });
    it("deletes the editor", function () {
      editor.delete();
    });
  });

  describe("checks that there is a format bar when editing a Markdown file", function () {
    let editor;
    it("creates the editor", async function () {
      editor = new TestEditor("md");
      await editor.wait_until_loaded();
    });
    it("checks that there is a format bar", function () {
      expect(
        $(".cc-frame-tree-editor").find(".cc-frame-tree-format-bar").length
      ).to.equal(1);
    });
    it("deletes the editor", function () {
      editor.delete();
    });
  });
});
