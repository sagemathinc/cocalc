/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Wrapper object around xterm.js's Terminal, which adds
extra support for being connected to:
  - a backend project via a websocket
  - react/redux
  - frame-editor (via actions)
*/

import { Map } from "immutable";
import { callback, delay } from "awaiting";
import { redux, ProjectActions } from "../../app-framework";
import { debounce } from "lodash";
import { aux_file } from "@cocalc/util/misc";
import { Terminal as XTerminal } from "xterm";
import "xterm/css/xterm.css";

import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { WebglAddon } from "xterm-addon-webgl";
import { setTheme } from "./themes";
import { project_websocket, touch, touch_project } from "../generic/client";
import { Actions, CodeEditorState } from "../code-editor/actions";
import { set_buffer, get_buffer } from "../../copy-paste-buffer";
import {
  close,
  endswith,
  filename_extension,
  replace_all,
  bind_methods,
} from "@cocalc/util/misc";
import { open_init_file } from "./init-file";
import { ConnectionStatus } from "../frame-tree/types";
import { file_associations } from "../../file-associations";

declare const $: any;
import { isCoCalcURL } from "@cocalc/frontend/lib/cocalc-urls";

// NOTE: Keep this consistent with server.ts on the backend...  Someday make configurable.
const SCROLLBACK = 5000;
const MAX_HISTORY_LENGTH = 100 * SCROLLBACK;

interface Path {
  file?: string;
  directory?: string;
}

export class Terminal<T extends CodeEditorState = CodeEditorState> {
  private state: string = "ready";
  private actions: Actions<T>;
  private account_store: any;
  private project_actions: ProjectActions;
  private terminal_settings: Map<string, any>;
  private project_id: string;
  private path: string;
  private term_path: string;
  private id: string;
  readonly rendererType: "dom" | "canvas";
  private terminal: XTerminal;
  private is_paused: boolean = false;
  private keyhandler_initialized: boolean = false;
  /* We initially have to ignore when rendering the initial history.
    To TEST this, do this in a terminal, then reconnect:
         printf "\E[c\n" ; sleep 1 ; echo
    The above causes the history to have device attribute requests, which
    will result in spurious control codes in some cases if the code below
    is wrong.  It's also good to test `jupyter console --kernel=python3`,
    do something, then exit.
    */

  private ignore_terminal_data: boolean = true;
  private render_buffer: string = "";
  private conn_write_buffer: any = [];
  private history: string = "";
  private last_geom: { rows: number; cols: number } | undefined;
  private resize_after_no_ignore: { rows: number; cols: number } | undefined;
  private last_active: number = 0;
  // conn = connection to project -- a primus websocket channel.
  private conn?: any;
  private touch_interval: any; // number doesn't work anymore and Timer doesn't exist everywhere... headache. Todo.

  public is_visible: boolean = false;
  public element: HTMLElement;

  private command?: string;
  private args?: string[];

  private fitAddon: FitAddon;
  private webLinksAddon: WebLinksAddon;

  private render_done: Function[] = [];

  constructor(
    actions: Actions<T>,
    number: number,
    id: string,
    parent: HTMLElement,
    command?: string,
    args?: string[]
  ) {
    bind_methods(this);
    this.ask_for_cwd = debounce(this.ask_for_cwd);

    this.actions = actions;
    this.account_store = redux.getStore("account");
    this.project_actions = redux.getProjectActions(actions.project_id);
    if (this.account_store == null) {
      throw Error("user must be signed in and account store initialized");
    }
    this.terminal_settings = Map(); // what was last set.
    this.project_id = actions.project_id;
    this.path = actions.path;
    this.command = command;
    this.args = args;
    this.rendererType = "canvas";
    const cmd = command ? "-" + replace_all(command, "/", "-") : "";
    // This is the one and only place number is used.
    // It's very important though.
    this.term_path = aux_file(`${this.path}-${number}${cmd}`, "term");
    this.id = id;

    this.terminal = new XTerminal(this.get_xtermjs_options());

    this.webLinksAddon = new WebLinksAddon(handleLink);
    this.terminal.loadAddon(this.webLinksAddon);

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    this.terminal.open(parent);
    if (this.terminal.element == null) {
      throw Error("terminal.element must be defined");
    }
    // Uncomment this to enable a webgl terminal, with fallback to
    // canvas if webgl isn't available.  I'm disabling this since it
    // isn't noticeably faster over the web at least.  Also, I had
    // it crash on latest chrome and a solid modern laptop, perha due to
    // https://github.com/xtermjs/xterm.js/issues/2253
    // Now that #2253 is fixed, let's try this again.
    try {
      const addon = new WebglAddon();
      addon.onContextLoss(() => {
        addon.dispose();
      });
      this.terminal.loadAddon(addon);
    } catch (err) {
      console.log("WebGL Terminal not available; falling back to canvas.");
    }

    this.element = this.terminal.element;
    this.update_settings();
    this.init_title();
    this.init_terminal_data();
    this.init_settings();
    this.init_touch();
    this.set_connection_status("disconnected");

    // The docs https://xtermjs.org/docs/api/terminal/classes/terminal/#resize say
    // "It’s best practice to debounce calls to resize, this will help ensure that
    //  the pty can respond to the resize event before another one occurs."
    // We do NOT debounce, because it strangely breaks everything,
    // as you can see by just resizing the window.
    // this.terminal_resize = debounce(this.terminal_resize, 2000);
  }

  private get_xtermjs_options(): any {
    const rendererType = this.rendererType;
    const settings = this.account_store.get("terminal");
    if (settings == null) {
      // not fully loaded yet.
      return { rendererType };
    }
    const scrollback = settings.get("scrollback", SCROLLBACK);

    // Tell the terminal to use the browser's setting
    // for the generic "monospace" font family.
    // This can be tuned in the browser settings.
    const fontFamily = "monospace";

    // The following option possibly makes xterm.js better at
    // handling huge bursts of data by pausing the backend temporarily.
    // DO NOT USE! It directly and "violently" conflicts with Ipython's
    // naive use of "Ctrl+S" for I-search mode.
    // https://github.com/sagemathinc/cocalc/issues/3236
    // const useFlowControl = true;

    return { rendererType, scrollback, fontFamily };
  }

  private assert_not_closed(): void {
    if (this.state === "closed") {
      throw Error("BUG -- Terminal is closed.");
    }
  }

  close(): void {
    this.assert_not_closed();
    this.set_connection_status("disconnected");
    this.state = "closed";
    clearInterval(this.touch_interval);
    this.account_store.removeListener("change", this.update_settings);
    this.terminal.dispose();
    if (this.conn != null) {
      this.disconnect();
    }
    close(this);
    this.state = "closed";
  }

  private disconnect(): void {
    if (this.conn === undefined) {
      return;
    }
    this.conn.removeAllListeners();
    this.conn.end();
    delete this.conn;
    this.set_connection_status("disconnected");
  }

  private update_settings(): void {
    this.assert_not_closed();
    const settings = this.account_store.get("terminal");
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

    // TODO -- make configurable by user (actually
    // scrollback is never set in settings).
    // Also, will need to impact other things, like
    // history...  So NOT straightforward.
    if (
      settings.get("scrollback", SCROLLBACK) !==
      this.terminal_settings.get("scrollback", SCROLLBACK)
    ) {
      this.terminal.setOption(
        "scrollback",
        settings.get("scrollback", SCROLLBACK)
      );
    }

    this.terminal_settings = settings;
  }

  async connect(): Promise<void> {
    this.assert_not_closed();

    this.last_geom = undefined;
    if (this.conn !== undefined) {
      this.disconnect();
    }
    try {
      this.set_connection_status("connecting");
      const ws = await project_websocket(this.project_id);
      if (this.state === "closed") {
        return;
      }
      const options: any = {};
      if (this.command != null) {
        options.command = this.command;
      }
      if (this.args != null) {
        options.args = this.args;
      }
      options.env = this.actions.get_term_env();
      options.path = this.path;
      this.conn = await ws.api.terminal(this.term_path, options);
      if (this.state === "closed") {
        return;
      }
    } catch (err) {
      if (this.state === "closed") {
        return;
      }
      this.set_connection_status("disconnected");
      // console.log(`terminal connect error -- ${err}; will try again in 2s...`);
      await delay(2000);
      if (this.state === "closed") {
        return;
      }
      this.connect();
      return;
    }

    // Delete any data or state in terminal before receiving new data.
    this.terminal.reset();
    // Ignore device attr data coming back for initial load.
    this.ignore_terminal_data = true;
    this.conn.on("close", this.connect);
    this.conn.on("data", this._handle_data_from_project);
    if (endswith(this.path, ".term")) {
      touch_path(this.project_id, this.path); // no need to await
    }
    for (const data of this.conn_write_buffer) {
      this.conn.write(data);
    }
    this.conn_write_buffer = [];
    this.set_connection_status("connected");
    this.ask_for_cwd();
  }

  async reload(): Promise<void> {
    await this.connect();
  }

  conn_write(data): void {
    if (this.state == "closed") return; // no-op  -- see #4918
    if (this.conn === undefined) {
      this.conn_write_buffer.push(data);
      return;
    }
    this.conn.write(data);
  }

  private _handle_data_from_project(data: any): void {
    //console.log("data", data);
    this.assert_not_closed();
    if (data == null) {
      return;
    }
    this.activity();
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

  private activity() {
    this.project_actions.flag_file_activity(this.path);
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
    // tell anyone who waited for output coming back about this
    while (this.render_done.length > 0) {
      this.render_done.pop()?.();
    }
  }

  // blocks until the next call to this.render
  async wait_for_next_render(): Promise<void> {
    return new Promise((done, _) => {
      this.render_done.push(done);
    });
  }

  init_title(): void {
    this.terminal.onTitleChange((title) => {
      if (title != null) {
        this.actions.set_title(this.id, title);
        this.ask_for_cwd();
      }
    });
  }

  set_connection_status(status: ConnectionStatus): void {
    if (this.actions != null) {
      this.actions.set_connection_status(this.id, status);
    }
  }

  touch(): void {
    if (new Date().valueOf() - this.last_active < 70000) {
      touch_project(this.project_id);
    }
  }

  init_touch(): void {
    this.touch_interval = setInterval(this.touch, 60000);
  }

  init_keyhandler(): void {
    if (this.keyhandler_initialized) {
      return;
    }
    this.keyhandler_initialized = true;
    this.terminal.attachCustomKeyEventHandler((event) => {
      /*
      console.log("key", {
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        key: event.key,
      });
      */
      // record that terminal is being actively used.
      this.last_active = new Date().valueOf();
      this.ignore_terminal_data = false;

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
        (event.key === "<" || event.key == ",")
      ) {
        this.actions.decrease_font_size(this.id);
        return false;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        (event.key === ">" || event.key == ".")
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
        if (typeof mesg.rows == "number" && typeof mesg.cols == "number") {
          this.terminal_resize({ rows: mesg.rows, cols: mesg.cols });
        }
        break;
      case "cwd":
        this.actions.set_terminal_cwd(this.id, mesg.payload);
        break;
      case "burst":
        this.burst_on();
        break;
      case "no-burst":
        this.burst_off();
        break;
      case "no-ignore":
        this.no_ignore();
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

  // Try to resize terminal to given number of rows and columns.
  // This should not throw an exception no matter how wrong the input
  // actually is.
  private terminal_resize(opts: { cols: number; rows: number }): void {
    // console.log("terminal_resize", opts);
    // terminal.resize only takes integers, hence the floor;
    // we use floor to avoid cutting off a line halfway.
    // See https://github.com/sagemathinc/cocalc/issues/4140
    const { rows, cols } = opts;
    if (!(rows >= 1) || !(cols >= 1)) {
      // invalid measurement -- silently ignore
      // Note -- NaN is not >= 0; see
      // https://github.com/sagemathinc/cocalc/issues/4158
      return;
    }
    if (rows == Infinity || cols == Infinity) {
      // This also happens sometimes, evidently.  Just ignore it.
      // https://github.com/sagemathinc/cocalc/issues/4266
      return;
    }
    // Yes, this can throw an exception, thus breaking everything (resulting in
    // a blank page for the user).  This is probably an upstream xterm.js bug,
    // but we still have to work around it.
    // The fix to https://github.com/sagemathinc/cocalc/issues/4140
    // might now prevent this bug.
    //
    // as of Jan 2022: if there isn't enough content yet (i.e. a new terminal)
    // this doesn't resize properly.  This is probably a bug in xterm.js.
    try {
      this.terminal.resize(Math.floor(cols), Math.floor(rows));
    } catch (err) {
      console.warn("Error resizing terminal", err, rows, cols);
    }
  }

  // Stop ignoring terminal data... but ONLY once
  // the render buffer is also empty.
  async no_ignore(): Promise<void> {
    if (this.state === "closed") {
      return;
    }
    const g = (cb) => {
      const f = async () => {
        x.dispose();
        if (this.resize_after_no_ignore !== undefined) {
          this.terminal_resize(this.resize_after_no_ignore);
          delete this.resize_after_no_ignore;
        }
        // cause render to actually appear now.
        await delay(0);
        try {
          this.terminal.refresh(0, this.terminal.rows - 1);
        } catch (err) {
          // See https://github.com/sagemathinc/cocalc/issues/3572
          console.warn(`TERMINAL WARNING -- ${err}`);
        }
        // Finally start listening to user input.
        this.init_keyhandler();
        cb();
      };
      const x = this.terminal.onRender(f);
    };
    await callback(g);
  }

  close_request(): void {
    this.actions.set_error("You were removed from a terminal.");
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

  private use_subframe(path: string): boolean {
    const this_path_ext = filename_extension(this.actions.path);
    if (this_path_ext == "term") {
      // This is a .term tab, so always open the path in a new editor tab (not in the frame tre).
      return false;
    }
    const ext = filename_extension(path);
    const a = file_associations[ext];
    // Latex editor -- open tex files in same frame:
    if (this_path_ext == "tex" && a?.editor == "latex") return true;
    // Open file in this tab of it can be edited as code, or no editor
    // so text is the fallback.
    if (a == null || a.editor == "codemirror") {
      return true;
    }
    return false;
  }

  open_paths(paths: Path[]): void {
    if (!this.is_visible) {
      return;
    }
    const project_actions = this.actions._get_project_actions();
    let i = 0;
    let foreground = false;
    for (const x of paths) {
      i += 1;
      if (i === paths.length) {
        foreground = true;
      }
      if (x.file != null) {
        const path = x.file;
        if (this.use_subframe(path)) {
          this.actions.open_code_editor_frame(path);
        } else {
          project_actions.open_file({ path, foreground });
        }
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
    if (!this.is_visible) {
      return;
    }
    for (const x of paths) {
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
    if (this.ignore_terminal_data) {
      // CRITICAL -- we must wait until after the
      // next call to no_ignore before doing
      // the resize; otherwise, the resize causes
      // no_ignore to trigger prematurely (#3277).
      this.resize_after_no_ignore = { rows, cols };
      return;
    }
    this.terminal_resize({ rows, cols });
  }

  pause(): void {
    this.is_paused = true;
  }

  unpause(): void {
    this.is_paused = false;
    this.render(this.render_buffer);
    this.render_buffer = "";
  }

  ask_for_cwd(): void {
    this.conn_write({ cmd: "cwd" });
  }

  kick_other_users_out(): void {
    this.conn_write({ cmd: "boot" });
  }

  kill(): void {
    this.conn_write({ cmd: "kill" });
  }

  set_command(command: string | undefined, args: string[] | undefined): void {
    this.command = command;
    this.args = args;
    this.conn_write({ cmd: "set_command", command, args });
  }

  init_terminal_data(): void {
    this.terminal.onData((data) => {
      if (this.ignore_terminal_data) {
        return;
      }
      this.conn_write(data);
    });
  }

  init_settings(): void {
    this.account_store.on("change", this.update_settings);
  }

  focus(): void {
    if (this.state === "closed") {
      return;
    }
    this.terminal.focus();
  }

  refresh(): void {
    this.terminal.refresh(0, this.terminal.rows - 1);
  }

  async edit_init_script(): Promise<void> {
    try {
      await open_init_file(this.actions._get_project_actions(), this.term_path);
    } catch (err) {
      if (this.state === "closed") {
        return;
      }
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
    const geom = this.fitAddon.proposeDimensions();
    // console.log('measure_size', geom);
    if (geom == null) return;
    const { rows, cols } = geom;
    if (this.ignore_terminal_data) {
      // during the initial render
      this.terminal_resize({ rows, cols });
    }
    if (
      this.last_geom !== undefined &&
      this.last_geom.rows === rows &&
      this.last_geom.cols === cols
    ) {
      return;
    }
    this.last_geom = { rows, cols };
    this.conn_write({ cmd: "size", rows, cols });
  }

  copy(): void {
    const sel: string = this.terminal.getSelection();
    set_buffer(sel);
    this.terminal.focus();
  }

  paste(): void {
    this.terminal.clearSelection();
    this.terminal.paste(get_buffer());
    this.terminal.focus();
  }

  scroll_to_bottom(): void {
    // Upstream bug workaround -- we scroll to top first, then bottom
    // entirely to workaround a bug. This is NOT fixed by the Oct 2018
    // term.js release, despite it touching relevant code.
    this.terminal.scrollToTop();
    this.terminal.scrollToBottom();
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

function handleLink(_: MouseEvent, uri: string): void {
  if (!isCoCalcURL(uri)) {
    window.open(uri, "_blank");
    return;
  }
  // This horrendous code is because process-links is so "badly"
  // written, that its logic can only be used via jQuery...
  // and I don't want to rewrite it right now.
  const e = $(`<div><a href='${uri}'>x</a></div>`);
  e.process_smc_links();
  e.find("a").click();
}
