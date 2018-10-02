
import { EventEmitter } from "events";
import { aux_file } from "../frame-tree/util";

import { debounce } from "underscore";
import { Map } from "immutable";
import { delay } from "awaiting";

import { AppRedux } from "smc-webapp/app-framework";
import { Terminal as XTerminal } from "xterm";
import { setTheme } from "./themes";
import { project_websocket } from "../generic/client";

const SCROLLBACK = 5000;
const MAX_HISTORY_LENGTH = 100 * SCROLLBACK;

export class Terminal extends EventEmitter {
  private state: string = "ready";
  private redux: AppRedux;
  private account: any;
  private terminal_settings: Map<string, any>;
  private project_id: string;
  private tab_path: string;
  private path: string;
  private number: number;
  private terminal: XTerminal;
  private is_paused: boolean = false;
  private ignore_terminal_data: boolean = false;
  private render_buffer: string = "";
  private history: string = "";
  private conn?: any; // connection to project -- a primus websocket channel.

  constructor(
    redux: AppRedux,
    project_id: string,
    tab_path: string,
    number: number
  ) {
    super();
    for (let f of ["update_settings", "connect", "_handle_data_from_project"]) {
      this[f] = this[f].bind(this);
    }
    this.full_rerender = debounce(this.full_rerender, 250);

    this.redux = redux;
    this.account = this.redux.getStore("account");
    if (this.account == null) {
      throw Error("user must be signed in and account store initialized");
    }
    this.terminal_settings = Map(); // what was last set.
    this.project_id = project_id;
    this.tab_path = tab_path;
    this.path = aux_file(`${tab_path}-${number}`, "term");
    this.number = number;
    this.terminal = new XTerminal();
    this.update_settings();
    (this.account as any).on("change", this.update_settings);
  }

  close(): void {
    this.state = "closed";
    this.account.removeListener("change", this.update_settings);
    delete this.redux;
    delete this.account;
    delete this.terminal_settings;
    delete this.project_id;
    delete this.tab_path;
    delete this.path;
    delete this.number;
    delete this.render_buffer;
    delete this.history;
    this.terminal.destroy();
    if (this.conn != null) {
      this.disconnect();
    }
  }

  disconnect(): void {
    this.conn.removeAllListeners();
    this.conn.end();
    delete this.conn;
  }

  update_settings(): void {
    if (this.state === "closed") {
      return;
    }
    const settings = this.account.get("settings");
    if (this.terminal_settings.equals(settings)) {
      // no changes
      return;
    }

    if (
      settings.get("color_scheme") !==
      this.terminal_settings.get("color_scheme")
    ) {
      setTheme(this.terminal, settings.get("color_scheme"));
    }

    if (settings.get("font_size") !== this.terminal_settings.get("font_size")) {
      this.terminal.setOption("fontSize", settings.get("font_size"));
    }

    // The following option possibly makes xterm.js better at
    // handling huge bursts of data by pausing the backend temporarily.
    // DO NOT USE! It directly and "violently" conflicts with Ipython's
    // naive use of "Ctrl+S" for I-search mode.
    // https://github.com/sagemathinc/cocalc/issues/3236
    // this.terminal.setOption("useFlowControl", true);

    // Interesting to play with, but breaks copy/paste and maybe other
    // things right now, probably due to CSS subtlety.
    //terminal.setOption("rendererType", "dom");

    // TODO -- make configurable by user (actually scrollback is never set in settings).
    // Also, will need to impact other things, like history...  So NOT straightforward.
    if (
      settings.get("scrollback", SCROLLBACK) !==
      this.terminal_settings.get("scrollback", SCROLLBACK)
    ) {
      this.terminal.setOption("scrollback", settings.get("scrollback", SCROLLBACK));
    }

    if (settings.get("font") !== this.terminal_settings.get("font")) {
      this.terminal.setOption("fontFamily", settings.get("font"));
    }

    this.terminal_settings = settings;
  }

  async connect(): Promise<void> {
    let is_reconnect: boolean = false;
    if (this.conn !== undefined) {
      is_reconnect = true;
      this.disconnect();
    }
    const ws = await project_websocket(this.project_id);
    this.conn = await ws.api.terminal(this.path);
    this.ignore_terminal_data = true;
    this.conn.on("close", this.connect);
    this.conn.on("data", this._handle_data_from_project);
    if (is_reconnect) {
      this.emit("reconnect");
    }
  }

  _handle_data_from_project(data: any): void {
    switch (typeof data) {
      case "string":
        if (this.is_paused && !this.ignore_terminal_data) {
          this.render_buffer += data;
        } else {
          this.render(data);
        }
        break;

      case "object":
        this.emit("mesg", data);
        break;

      default:
        console.warn("TERMINAL: no way to handle data -- ", data);
    }
  }

  render(data: string): void {
    this.history += data;
    if (this.history.length > MAX_HISTORY_LENGTH) {
      this.history = this.history.slice(
        this.history.length - Math.round(MAX_HISTORY_LENGTH / 1.5)
      );
    }
    this.terminal.write(data);
  }

  /* To TEST this full_rerender, do this in a terminal then start resizing it:
         printf "\E[c\n" ; sleep 1 ; echo
    The above causes the history to have device attribute requests, which
    will result in spurious control codes in some cases if the code below
    is wrong.  It's also good to test `jupyter console --kernel=python3`,
    do something, then exit.
  */
  async full_rerender(): Promise<void> {
    this.ignore_terminal_data = true;
    this.terminal.reset();
    // This is a horrible hack, since we have to be sure the
    // reset (and its side effects) are really done before writing
    // the history again -- otherwise, the scroll is messed up.
    // The call to requestAnimationFrame is also done in xterm.js.
    // This really sucks.  It would probably be far better to just
    // REPLACE the terminal by a new one on resize!
    await delay(0);
    requestAnimationFrame(async () => {
      await delay(1);
      this.terminal.write(this.history);
      // NEED to make sure no device attribute requests are going out (= corruption!)
      // TODO: surely there is a better way.
      await delay(150);
      // NOTE: this is a BUG -- it scrolls the text to the
      // bottom, but the scrollbar is on top; it's very confusing for users.
      this.terminal.scrollToBottom(); // just in case.
      this.ignore_terminal_data = false;
    });
  }
}
