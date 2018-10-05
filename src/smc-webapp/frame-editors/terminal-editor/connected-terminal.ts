/*
Wrapper object around xterm.js's Terminal, which adds
extra support for being connected to:
  - a backend project via a websocket
  - react/redux
  - frame-editor (via actions)
*/

import { reuseInFlight } from "async-await-utils/hof";
import { debounce } from "underscore";
import { Map } from "immutable";
import { delay } from "awaiting";

import { aux_file } from "../frame-tree/util";

import { Terminal as XTerminal } from "xterm";
require("xterm/lib/xterm.css");
import { proposeGeometry } from "xterm/lib/addons/fit/fit";

import * as webLinks from "xterm/lib/addons/webLinks/webLinks";
webLinks.apply(XTerminal);

import { setTheme } from "./themes";
import { project_websocket, touch } from "../generic/client";
import { Actions } from "../code-editor/actions";

import { endswith } from "../generic/misc";
import { open_init_file } from "./init-file";

const SCROLLBACK = 3000;
const MAX_HISTORY_LENGTH = 100 * SCROLLBACK;

interface Path {
  file?: string;
  directory?: string;
}

// todo: move to generic util if this works.
function bind(that: any, v: string[]): void {
  for (let f of v) {
    that[f] = that[f].bind(that);
  }
}

export class Terminal {
  private state: string = "ready";
  private actions: Actions;
  private account: any;
  private terminal_settings: Map<string, any>;
  private project_id: string;
  private path: string;
  private term_path: string;
  private number: number;
  private id: string;
  private terminal: XTerminal;
  private is_paused: boolean = false;
  private ignore_terminal_data: boolean = false;
  private render_buffer: string = "";
  private conn_write_buffer: any = [];
  private history: string = "";
  // conn = connection to project -- a primus websocket channel.
  private conn?: any;
  public is_mounted: boolean = false;
  public element: HTMLElement;

  constructor(
    actions: Actions,
    number: number,
    id: string,
    parent: HTMLElement
  ) {
    bind(this, [
      "handle_mesg",
      "update_settings",
      "connect",
      "_handle_data_from_project"
    ]);

    this.connect = reuseInFlight(this.connect);
    this.full_rerender = debounce(this.full_rerender, 250);

    this.actions = actions;
    this.account = (this.actions as any).redux.getStore("account");
    if (this.account == null) {
      throw Error("user must be signed in and account store initialized");
    }
    this.terminal_settings = Map(); // what was last set.
    this.project_id = actions.project_id;
    this.path = actions.path;
    this.term_path = aux_file(`${this.path}-${number}`, "term");
    this.number = number;
    this.id = id;
    this.terminal = new XTerminal();
    this.terminal.open(parent);
    this.element = this.terminal.element;
    this.update_settings();
    this.init_weblinks();
    this.init_keyhandler();
    this.init_title();
    this.init_terminal_data();
    this.init_settings();
  }

  assert_not_closed(): void {
    if (this.state === "closed") {
      throw Error("BUG -- Terminal is closed.");
    }
  }

  close(): void {
    this.assert_not_closed();
    this.state = "closed";
    this.account.removeListener("change", this.update_settings);
    delete this.actions;
    delete this.account;
    delete this.terminal_settings;
    delete this.project_id;
    delete this.path;
    delete this.term_path;
    delete this.number;
    delete this.render_buffer;
    delete this.history;
    this.terminal.destroy();
    if (this.conn != null) {
      this.disconnect();
    }
  }

  disconnect(): void {
    if (this.conn === undefined) {
      return;
    }
    this.conn.removeAllListeners();
    this.conn.end();
    delete this.conn;
  }

  update_settings(): void {
    this.assert_not_closed();
    const settings = this.account.get("terminal");
    if (settings == null || this.terminal_settings.equals(settings)) {
      // no changes or not yet loaded
      return;
    }

    if (
      settings.get("color_scheme") !==
      this.terminal_settings.get("color_scheme")
    ) {
      setTheme(this.terminal, settings.get("color_scheme"));
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
      this.terminal.setOption(
        "scrollback",
        settings.get("scrollback", SCROLLBACK)
      );
    }

    if (settings.get("font") !== this.terminal_settings.get("font")) {
      this.terminal.setOption("fontFamily", settings.get("font"));
    }

    this.terminal_settings = settings;
  }

  async connect(): Promise<void> {
    this.assert_not_closed();
    if (this.conn !== undefined) {
      this.disconnect();
    }
    const ws = await project_websocket(this.project_id);
    this.conn = await ws.api.terminal(this.term_path);
    this.ignore_terminal_data = true;
    this.conn.on("close", this.connect);
    this.conn.on("data", this._handle_data_from_project);
    touch_path(this.project_id, this.term_path);
    for (let data of this.conn_write_buffer) {
      this.conn.write(data);
    }
    this.conn_write_buffer = [];
  }

  async reload(): Promise<void> {
    await this.connect();
  }

  conn_write(data): void {
    if (this.conn === undefined) {
      this.conn_write_buffer.push(data);
      return;
    }
    this.conn.write(data);
  }

  _handle_data_from_project(data: any): void {
    this.assert_not_closed();
    switch (typeof data) {
      case "string":
        if (this.is_paused && !this.ignore_terminal_data) {
          this.render_buffer += data;
        } else {
          this.render(data);
        }
        break;

      case "object":
        this.handle_mesg(data);
        break;

      default:
        console.warn("TERMINAL: no way to handle data -- ", data);
    }
  }

  render(data: string): void {
    this.assert_not_closed();
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
    this.assert_not_closed();
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

  init_title(): void {
    this.terminal.on("title", title => {
      if (title != null) {
        this.actions.set_title(this.id, title);
      }
    });
  }

  init_weblinks(): void {
    (this.terminal as any).webLinksInit();
  }

  init_keyhandler(): void {
    this.terminal.attachCustomKeyEventHandler(event => {
      //console.log("key", event);
      if (this.is_paused) {
        this.actions.unpause(this.id);
      }

      if (event.type === "keypress") {
        // ignore this
        return true;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key === "<"
      ) {
        this.actions.decrease_font_size(this.id);
        return false;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key === ">"
      ) {
        this.actions.increase_font_size(this.id);
        return false;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "c" &&
        this.terminal.hasSelection()
      ) {
        // Return so that the usual OS copy happens
        // instead of interrupt signal.
        return false;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "v") {
        // Return so that the usual paste happens.
        return false;
      }

      return true;
    });
  }

  handle_mesg(mesg: {
    cmd: string;
    rows?: number;
    cols?: number;
    payload: any;
  }): void {
    //console.log("handle_mesg", this.id, mesg);
    switch (mesg.cmd) {
      case "size":
        if (typeof mesg.rows === "number" && typeof mesg.cols === "number") {
          this.resize(mesg.rows, mesg.cols);
        }
        break;
      case "burst":
        this.burst_on();
        break;
      case "no-burst":
        this.burst_off();
        break;
      case "no-ignore":
        this.ignore_off();
        break;
      case "close":
        this.close_request();
        break;
      case "message":
        const payload = mesg.payload;
        if (payload == null) {
          break;
        }
        if (payload.event === "open") {
          if (payload.paths !== undefined) {
            this.open_paths(payload.paths);
          }
          break;
        }
        if (payload.event === "close") {
          if (payload.paths !== undefined) {
            this.close_paths(payload.paths);
          }
          break;
        }
        break;
      default:
        console.warn("handle_mesg -- unhandled", this.id, mesg);
    }
  }

  burst_on(): void {
    // TODO: would be better to make specific to that terminal... but not implemented.
    const mesg = "WARNING: Large burst of output! (May try to interrupt.)";
    this.actions.set_status(mesg);
    this.actions.set_error(mesg);
  }

  burst_off(): void {
    this.actions.set_status("");
    this.actions.set_error("");
  }

  async ignore_off(): Promise<void> {
    await delay(100);
    this.ignore_terminal_data = false;
  }

  close_request(): void {
    this.actions.set_error(
      "Another user closed one of your terminal sessions."
    );
    // If there is only one frame, we close the
    // entire editor -- otherwise, we close only
    // this frame.
    if (
      this.actions._tree_is_single_leaf() &&
      endswith(this.actions.path, ".term")
    ) {
      this._close_path(this.path);
    } else {
      this.actions.close_frame(this.id);
    }
  }

  open_paths(paths: Path[]): void {
    if (!this.is_mounted) {
      return;
    }
    const project_actions = this.actions._get_project_actions();
    let i = 0;
    let foreground = false;
    for (let x of paths) {
      i += 1;
      if (i === paths.length) {
        foreground = true;
      }
      if (x.file != null) {
        const path = x.file;
        project_actions.open_file({ path, foreground });
      }
      if (x.directory != null && foreground) {
        project_actions.open_directory(x.directory);
      }
    }
  }

  _close_path(path: string): void {
    const project_actions = this.actions._get_project_actions();
    project_actions.close_tab(path);
  }

  close_paths(paths: Path[]): void {
    if (!this.is_mounted) {
      return;
    }
    for (let x of paths) {
      if (x.file != null) {
        this._close_path(x.file);
      }
    }
  }

  resize(rows: number, cols: number): void {
    if (this.terminal.cols === cols && this.terminal.rows === rows) {
      // no need to resize
      return;
    }
    this.terminal.resize(cols, rows);
  }

  pause(): void {
    this.is_paused = true;
  }

  unpause(): void {
    this.is_paused = false;
    this.render(this.render_buffer);
    this.render_buffer = "";
  }

  kick_other_users_out(): void {
    this.conn_write({ cmd: "boot" });
  }

  init_terminal_data(): void {
    this.terminal.on("data", data => {
      if (this.ignore_terminal_data) {
        return;
      }
      this.conn_write(data);
    });
  }

  init_settings(): void {
    (this.account as any).on("change", this.update_settings);
  }

  focus(): void {
    this.assert_not_closed();
    this.terminal.focus();
  }

  async edit_init_script(): Promise<void> {
    try {
      await open_init_file(this.actions._get_project_actions(), this.term_path);
    } catch (err) {
      this.actions.set_error(`Problem opening init file -- ${err}`);
    }
  }

  popout(): void {
    this.actions
      ._get_project_actions()
      .open_file({ path: this.term_path, foreground: true });
  }

  set_font_size(font_size: number): void {
    this.terminal.setOption("fontSize", font_size);
  }

  getOption(option: string): any {
    return this.terminal.getOption(option);
  }

  measure_size(): void {
    const geom = proposeGeometry(this.terminal);
    if (geom == null) return;
    const { rows, cols } = geom;
    this.conn_write({ cmd: "size", rows, cols });
  }
}

async function touch_path(project_id: string, path: string): Promise<void> {
  // touch the original path file on disk, so it exists and is
  // modified -- that's the ONLY purpose of this touch.
  // Also this is in a separate function so we can await it and catch exception.
  try {
    await touch(project_id, path);
  } catch (err) {
    console.warn(`error touching ${path} -- ${err}`);
  }
}
