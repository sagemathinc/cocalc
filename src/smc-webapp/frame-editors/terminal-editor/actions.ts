/*
Terminal Editor Actions
*/
import { Actions as CodeEditorActions } from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";

import { connect_to_server } from "./connect-to-server";

export class Actions extends CodeEditorActions {
  private terminals: any = {};

  _init2(): void {}

  _raw_default_frame_tree(): FrameTree {
    return { type: "terminal" };
  }

  set_terminal(id: string, terminal: any): void {
    this.terminals[id] = terminal;
    connect_to_server(this.project_id, this.path, terminal);
    terminal.on("mesg", mesg => this.handle_mesg(id, mesg));
    terminal.on("title", title => this.set_title(id, title));
    this.init_settings(terminal);
  }

  _get_terminal(id:string) : any {
    return this.terminals[id];
  }

  close_frame_hook(id: string): void {
    const term = this.terminals[id];
    if (term != null) {
      delete this.terminals[id];
      term.destroy();
    }
  }

  set_title(id: string, title: string) {
    console.log("set title of term ", id, " to ", title);
    this.set_frame_tree({id:id, title:title});
  }

  handle_mesg(
    id: string,
    mesg: { cmd: string; rows?: number; cols?: number }
  ): void {
    console.log("handle_mesg", id, mesg);
    switch (mesg.cmd) {
      case "size":
        //this.handle_resize(mesg.rows, mesg.cols);
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

  init_settings(terminal: any): void {
    const account = this.redux.getStore("account");
    if (account == null) {
      return;
    }
    const settings = account.get_terminal_settings();
    if (settings == null) {
      return;
    }
    terminal.set_font_size(settings.font_size ? settings.font_size : 14);
    terminal.set_color_scheme(
      settings.color_scheme ? settings.color_scheme : "default"
    );
    terminal.set_font_family(
      settings.font ? settings.font : "monospace"
    );
  }
}
