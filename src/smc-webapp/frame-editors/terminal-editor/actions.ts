/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Terminal Editor Actions
*/
import { Actions } from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";
const { open_new_tab } = require("smc-webapp/misc_page");

const HELP_URL = "https://doc.cocalc.com/terminal.html";

export class TerminalActions extends Actions {
  // no need to open any syncstring for terminals -- they don't use database sync.
  protected doctype: string = "none";

  _init2(): void {}

  _raw_default_frame_tree(): FrameTree {
    return { type: "terminal" };
  }

  public guide_command(id: string, cmd: string): void {
    console.log("cmd", cmd, "id", id);
    const last_terminal_id = this._get_most_recent_active_frame_id_of_type(
      "terminal"
    );
    if (last_terminal_id != null) {
      // De-maximize if in full screen mode.
      this.unset_frame_full();
      this.focus(last_terminal_id);
      this.set_active_id(last_terminal_id);
      const terminal = this.terminals.get(last_terminal_id);
      console.log("terminal " + last_terminal_id, "→", terminal);
      if (terminal == null) return;
      terminal.conn_write("ls\n");
    }
  }

  public help(): void {
    open_new_tab(HELP_URL);
  }

  public async guide(): Promise<void> {
    const id = this.show_focused_frame_of_type(
      "commands_guide",
      "col",
      false,
      3 / 4
    );
    // the click to select TOC focuses the active id back on the notebook
    await delay(0);
    if (this._state === "closed") return;
    this.set_active_id(id, true);
  }
}
