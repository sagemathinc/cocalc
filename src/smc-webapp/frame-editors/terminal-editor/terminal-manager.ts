/*
Manage a collection of terminals in the frame tree.
*/

import { Actions, CodeEditorState } from "../code-editor/actions";
import * as tree_ops from "../frame-tree/tree-ops";
import { len } from "smc-util/misc2";
import { Terminal } from "./connected-terminal";

export class TerminalManager<T extends CodeEditorState = CodeEditorState> {
  private terminals: { [key: string]: Terminal<T> } = {};
  private actions: Actions<T>;

  constructor(actions: Actions<T>) {
    this.actions = actions;
  }

  close(): void {
    for (const id in this.terminals) {
      this.close_terminal(id);
    }
    delete this.actions;
    delete this.terminals;
  }

  _node_number(id: string, command: string | undefined): number {
    /* All this complicated code starting here is just to get
       a stable number for this frame. Sorry it is so complicated! */
    const node = this.actions._get_frame_node(id);
    if (node === undefined) {
      throw Error(`no node with id ${id}`);
    }
    let number = node.get("number");

    const numbers = {};
    for (const id0 in this.actions._get_leaf_ids()) {
      const node0 = tree_ops.get_node(this.actions._get_tree(), id0);
      if (
        node0 == null ||
        node0.get("type") != "terminal" ||
        node0.get("command") != command
      ) {
        continue;
      }
      const n = node0.get("number");
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
    return number;
  }

  get_terminal(id: string, parent: HTMLElement): Terminal<T> {
    const node = this.actions._get_frame_node(id);

    if (this.terminals[id] != null) {
      parent.appendChild(this.terminals[id].element);
    } else {
      let command: string | undefined = undefined;
      let args: string[] | undefined = undefined;
      if (node != null) {
        command = node.get("command");
        args = node.get("args");
      }
      this.terminals[id] = new Terminal<T>(
        this.actions,
        this._node_number(id, command),
        id,
        parent,
        command,
        args
      );
      this.terminals[id].connect();
    }
    const terminal = this.terminals[id];
    // pause: sync local view state with terminal state
    if (node != null) {
      if (node.get("is_paused")) {
        terminal.pause();
      } else {
        terminal.unpause();
      }
    }
    return terminal;
  }

  close_terminal(id: string): void {
    if (this.terminals[id] == null) {
      // graceful no-op if no such terminal.
      return;
    }
    this.terminals[id].close();
    delete this.terminals[id];
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

  get(id: string): Terminal<T> | undefined {
    return this.terminals[id];
  }

  kill(id: string): void {
    if (this.terminals[id] == null) {
      // graceful no-op if no such terminal.
      return;
    }
    this.terminals[id].kill();
  }

  set_command(
    id: string,
    command: string | undefined,
    args: string[] | undefined
  ): void {
    if (this.terminals[id] == null) {
      // graceful no-op if no such terminal.
      return;
    }
    this.terminals[id].set_command(command, args);
  }
}
