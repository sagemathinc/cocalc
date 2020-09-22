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

  help(): void {
    open_new_tab(HELP_URL);
  }

  public async clear(id: string) {
    this.clear_terminal_command(id);
    const t = this.terminals.get(id);
    // we also wait until it is "back again with a prompt" and issue the reset command
    if (t == null) return;
    await t.wait_for_next_render();
    await delay(1); // also wait a little bit
    t.conn_write("reset\n");
  }
}
