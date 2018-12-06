/*
Terminal Editor Actions
*/
import { Actions as CodeEditorActions } from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";
const { open_new_tab } = require("smc-webapp/misc_page");

const HELP_URL = "https://doc.cocalc.com/terminal.html";

export class Actions extends CodeEditorActions {
  // no need to open any syncstring for terminals -- they don't use database sync.
  protected doctype: string = "none";

  _init2(): void {}

  _raw_default_frame_tree(): FrameTree {
    return { type: "terminal" };
  }

  help(): void {
    open_new_tab(HELP_URL);
  }
}
