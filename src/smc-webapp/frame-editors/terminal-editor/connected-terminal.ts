import { Map } from "immutable";
import { AppRedux } from "smc-webapp/app-framework";
import { Terminal as XTerminal } from "xterm";
import { setTheme } from "./themes";
import { project_websocket } from "../generic/client";

const SCROLLBACK = 5000;
const MAX_HISTORY_LENGTH = 100 * SCROLLBACK;

export class Terminal extends EventEmitter {
  private state: string = "ready";
  private redux: AppRedux;
  private account: AppRedux;
  private terminal_settings: Map<string, any>;
  private project_id: string;
  private tab_path: string;
  private path: string;
  private number: number;
  private terminal: XTerminal;
  private is_paused: boolean = false;
  private conn?: any; // connection to project -- a primus websocket channel.

  constructor(
    redux: AppRedux,
    project_id: string,
    tab_path: string,
    number: number
  ) {
    for (let f of ["update_settings", "connect", "handle_data_from_project"]) {
      this[f] = this[f].bind(this);
    }

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
    account.on("change", this.update_settings);
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
      setTheme(terminal, settings.get("color_scheme"));
    }

    if (settings.get("font_size") !== this.terminal_settings.get("font_size")) {
      terminal.setOption("fontSize", settings.get("font_size"));
    }

    // The following option possibly makes xterm.js better at
    // handling huge bursts of data by pausing the backend temporarily.
    terminal.setOption("useFlowControl", true);

    // Interesting to play with, but breaks copy/paste and maybe other
    // things right now, probably due to CSS subtlety.
    //terminal.setOption("rendererType", "dom");

    // TODO -- make configurable by user (actually scrollback is never set in settings).
    // Also, will need to impact other things, like history...  So NOT straightforward.
    if (
      settings.get("scrollback", SCROLLBACK) !==
      this.terminal_settings.get("scrollback", SCROLLBACK)
    ) {
      terminal.setOption("scrollback", settings.get("scrollback", SCROLLBACK));
    }

    if (settings.get("font") !== this.terminal_settings.get("font")) {
      terminal.setOption("fontFamily", settings.get("font"));
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
    this.conn.on("data", this.handle_data_from_project);
    if (is_reconnect) {
      this.emit("reconnect");
    }
  }

  handle_data_from_project(data: any): void {
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
    if (typeof data === "string") {
    } else if (typeof data === "object") {
      terminal.emit("mesg", data);
    }
  }
}
