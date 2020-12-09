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

interface CmdOpts {
  run?: boolean; // if true (default) also send a return key
  cleanup?: boolean; // if true (default), the current line is cleared before the cmd is entered
  userarg?: boolean; // append " '|'" to the command, where | is where the user's cursor ends up (think of git commit -m '[bla]')
  special?: string; // instead of the cmd arg, this sends a special character sequence (like, [tab])
}

export class TerminalActions extends Actions {
  // no need to open any syncstring for terminals -- they don't use database sync.
  protected doctype: string = "none";

  _init2(): void {}

  _raw_default_frame_tree(): FrameTree {
    return { type: "terminal" };

    // disabled -- "guide" causes side effects with jupyter notebook
    //  if (this.is_public) {
    //    return { type: "terminal" };
    //  } else {
    //    return {
    //      direction: "col",
    //      type: "node",
    //      first: { type: "terminal" },
    //      second: { type: "commands_guide" },
    //      pos: 3 / 4,
    //    };
    //  }
  }

  public get_terminal(id: string) {
    return this.terminals.get(id);
  }

  // this sends a given line "cmd" to the actual terminal
  // the extra options slightly modify what it does – check the interface for the explanation
  public run_command(cmd: string, opts: CmdOpts): void {
    const { run = true, cleanup = true, userarg = false, special } = opts;
    const last_terminal_id = this._get_most_recent_active_frame_id_of_type(
      "terminal"
    );
    if (last_terminal_id != null) {
      // De-maximize if in full screen mode.
      this.unset_frame_full();
      this.focus(last_terminal_id);
      this.set_active_id(last_terminal_id);
      const terminal = this.terminals.get(last_terminal_id);
      if (terminal == null) return;
      // note: don't try to set these special char sequences in react – they're escaped
      switch (special) {
        case "up":
          terminal.conn_write("\x1b\x5b\x41");
          break;
        case "down":
          terminal.conn_write("\x1b\x5b\x42");
          break;
        case "tab":
          terminal.conn_write("\x09");
          break;
        case "ctrl-c":
          terminal.conn_write("\x03");
          break;
        default:
          // we clean up the input line before we send the command
          // Ctrl-e & Ctrl-u: move cursor to end of line and backwards delete the entire line
          // "$ showkey -a" helped me to get the hex codes:
          // ^E 	  5 0005 0x05
          // ^U 	 21 0025 0x15
          const send = run && !userarg ? "\n" : userarg ? "" : " ";
          const clean = cleanup ? "\x05\x15" : "";
          // userarg: we insert a space, quotes, and put the cursor inside the quotes
          const user = userarg ? " ''\x1b\x5b\x44" : "";
          terminal.conn_write(`${clean}${cmd}${user}${send}`);
          break;
      }
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
