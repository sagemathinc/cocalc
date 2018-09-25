/*
Manage a collection of terminals in the frame tree.
*/

import { Actions } from "../code-editor/actions";
import { AppRedux } from "../../app-framework";
import { connect_to_server } from "./connect-to-server";
import * as tree_ops from "../frame-tree/tree-ops";
import { len } from "../generic/misc";
import { Terminal } from "xterm";
import { setTheme } from "./themes";

export class TerminalManager {
  protected terminals: { [key: string]: Terminal } = {};
  private actions: Actions;
  private redux: AppRedux;

  constructor(actions: Actions, redux: AppRedux) {
    this.actions = actions;
    this.redux = redux;
  }

  close(): void {
    for (let id in this.terminals) {
      this.close_terminal(id);
    }
  }

  async set_terminal(id: string, terminal: Terminal): Promise<void> {
    this.terminals[id] = terminal;
    this.init_settings(terminal);

    /* All this complicated code starting here is just to get
       a stable number for this frame. Sorry it is so complicated! */
    let node = this.actions._get_frame_node(id);
    if (node === undefined) {
      // to satisfy typescript
      return;
    }
    let number = node.get("number");

    const numbers = {};
    for (let id0 in this.actions._get_leaf_ids()) {
      const node0 = tree_ops.get_node(this.actions._get_tree(), id0);
      if (node0 == null || node0.get("type") != "terminal") {
        continue;
      }
      let n = node0.get("number");
      if (n !== undefined) {
        if (numbers[n] && n === number) {
          number = undefined;
        }
        numbers[n] = true;
      }
    }
    for (let i = 0; i < len(numbers); i++) {
      if (!numbers[i]) {
        number = i;
        break;
      }
    }
    if (number === undefined) {
      number = len(numbers);
    }
    // Set number entry of this node.
    this.actions.set_frame_tree({ id, number });

    // OK, above got the stable number.  Now connect:
    try {
      await connect_to_server(
        this.actions.project_id,
        this.actions.path,
        terminal,
        number
      );
    } catch (err) {
      this.actions.set_error(
        `Error connecting to server -- ${err} -- try closing and reopening or restarting project.`
      );
    }
    terminal.on("mesg", mesg => this.handle_mesg(id, mesg));
    terminal.on("title", title => {
      if (title != null) {
        this.actions.set_title(id, title);
      }
    });
  }

  close_terminal(id: string): void {
    if (!this.terminals[id]) {
      // graceful no-op if no such terminal.
      return;
    }
    this.terminals[id].destroy();
    delete this.terminals[id];
  }

  exists(id: string): boolean {
    return this.terminals[id] !== undefined;
  }

  focus(id?: string): void {
    if (id === undefined) {
      id = this.actions._get_most_recent_terminal_id();
      if (id === undefined) {
        return; // no terminals
      }
    }
    const t = this.terminals[id];
    if (t !== undefined) {
      t.focus();
    }
  }

  get_terminal(id: string): Terminal | undefined {
    return this.terminals[id];
  }

  handle_mesg(
    id: string,
    mesg: { cmd: string; rows?: number; cols?: number }
  ): void {
    //console.log("handle_mesg", id, mesg);
    switch (mesg.cmd) {
      case "size":
        if (typeof mesg.rows === "number" && typeof mesg.cols === "number") {
          this.resize(id, mesg.rows, mesg.cols);
        }
        break;
      case "burst":
        break;
      case "no-burst":
        break;
      case "no-ignore":
        break;
      case "close":
        break;
    }
  }

  resize(id: string, rows: number, cols: number): void {
    const terminal: Terminal | undefined = this.get_terminal(id);
    if (terminal === undefined) {
      return;
    }
    terminal.resize(cols, rows);
  }

  init_settings(terminal: Terminal): void {
    const account = this.redux.getStore("account");
    if (account == null) {
      return;
    }
    const settings = account.get_terminal_settings();
    if (settings == null) {
      return;
    }

    if (settings.color_scheme !== undefined) {
      setTheme(terminal, settings.color_scheme);
    }

    terminal.setOption(
      "fontSize",
      settings.font_size ? settings.font_size : 14
    );

    if (settings.font) {
      terminal.setOption("fontFamily", settings.font);
    }
  }
}
