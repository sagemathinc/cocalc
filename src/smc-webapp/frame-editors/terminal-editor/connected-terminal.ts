import { Map } from "immutable";
import { AppRedux } from "smc-webapp/app-framework";
import { Terminal as XTerminal } from "xterm";
import { setTheme } from "./themes";

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
  private conn: any; // connection to project -- a primus websocket channel.

  constructor(
    redux: AppRedux,
    project_id: string,
    tab_path: string,
    number: number
  ) {
    this.update_settings = this.update_settings.bind(this);

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
      this.conn.end();
    }
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
}
