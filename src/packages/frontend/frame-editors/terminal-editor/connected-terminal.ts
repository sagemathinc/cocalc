/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Wrapper object around xterm.js's Terminal, which adds
extra support for being connected to:
  - a backend project via NATS
  - react/redux
  - frame-editor (via actions)
*/

import { callback, delay } from "awaiting";
import { Map } from "immutable";
import { debounce } from "lodash";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { ProjectActions, redux } from "@cocalc/frontend/app-framework";
import { get_buffer, set_buffer } from "@cocalc/frontend/copy-paste-buffer";
import { file_associations } from "@cocalc/frontend/file-associations";
import { isCoCalcURL } from "@cocalc/frontend/lib/cocalc-urls";
import {
  close,
  endswith,
  filename_extension,
  replace_all,
} from "@cocalc/util/misc";
import { Actions, CodeEditorState } from "../code-editor/actions";
import { ConnectionStatus } from "../frame-tree/types";
import { touch, touch_project } from "../generic/client";
import { ConnectedTerminalInterface } from "./connected-terminal-interface";
import { open_init_file } from "./init-file";
import { setTheme } from "./themes";
import { modalParams } from "@cocalc/frontend/compute/select-server-for-file";
import { ConatTerminal } from "./conat-terminal";
import { termPath } from "@cocalc/util/terminal/names";

declare const $: any;

// NOTE: Keep this consistent with server.ts on the backend...  Someday make configurable.
const SCROLLBACK = 5000;
const MAX_HISTORY_LENGTH = 100 * SCROLLBACK;

const MAX_DELAY = 10000;

const ENABLE_WEBGL = true;

interface Path {
  file?: string;
  directory?: string;
}

export class Terminal<T extends CodeEditorState = CodeEditorState> {
  private state: string = "ready";
  private actions: Actions<T> | ConnectedTerminalInterface;
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
  private pauseKeyCount: number = 0;
  private keyhandler_initialized: boolean = false;
  // last time user typed something
  private lastSend = 0;
  // last time we received data back from project
  private lastReceive = 0;
  /* We initially have to ignore when rendering the initial history.
    To TEST this, do this in a terminal, then reconnect:
         printf "\E[c\n" ; sleep 1 ; echo
    The above causes the history to have device attribute requests, which
    will result in spurious control codes in some cases if the code below
    is wrong.  It's also good to test `jupyter console --kernel=python3`,
    do something, then exit.
    */

  private render_buffer: string = "";
  private conn_write_buffer: string[] = [];
  private history: string = "";
  private last_geom: { rows: number; cols: number } | undefined;
  private resize_after_no_ignore: { rows: number; cols: number } | undefined;
  private last_active: number = 0;
  private conn?: ConatTerminal;
  private touch_interval;

  public is_visible: boolean = false;
  public element: HTMLElement;

  private command?: string;
  private args?: string[];
  private workingDir?: string;

  private fitAddon: FitAddon;
  private webLinksAddon: WebLinksAddon;

  private render_done: Function[] = [];
  private ignoreData: boolean = false;

  constructor(
    actions: Actions<T>,
    number: number,
    id: string,
    parent: HTMLElement,
    command?: string,
    args?: string[],
    workingDir?: string,
  ) {
    this.actions = actions;
    this.ask_for_cwd = debounce(this.ask_for_cwd);

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
    this.workingDir = workingDir;
    this.rendererType = "canvas";
    const cmd = command ? "-" + replace_all(command, "/", "-") : "";
    // This is the one and only place number is used.
    // It's very important though.
    this.term_path = termPath({ path: this.path, number, cmd });
    this.id = id;

    this.terminal = new XTerminal(this.get_xtermjs_options());
    this.terminal.options.allowProposedApi = true;

    this.webLinksAddon = new WebLinksAddon(handleLink);
    this.terminal.loadAddon(this.webLinksAddon);

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    this.terminal.open(parent);
    if (this.terminal.element == null) {
      throw Error("terminal.element must be defined");
    }

    if (ENABLE_WEBGL) {
      const webglAddon = new WebglAddon();
      try {
        this.terminal.loadAddon(webglAddon);
        webglAddon.onContextLoss(() => {
          // This really does work and properly switches back to canvas.  To convince yourself
          // of this, open a single terminal, then open another tab with another terminal and
          // split it about 20+ times. In the console, you'll see that the oldest webGL contexts
          // go away. That triggers calling this function, and indeed the terminal then falls
          // back seamlessly to canvas rendering.  Very impressive, xterm.js.
          webglAddon.dispose();
        });
      } catch (err) {
        // We have to disable the dispose when it doesn't get used, since it breaks
        // on cleanup, and the xtermjs api has no way of removing an addon, and
        // only catching the error on dispose later would mean leaving other things
        // potentially not cleaned up properly.  I read the code of webglAddon.dispose
        // and it doesn't do anything if the addon wasn't initialized.
        webglAddon.dispose = () => {};
        console.log(`WebGL Terminal not available (using fallback). -- ${err}`);
      }
    }

    this.element = this.terminal.element;
    this.update_settings();
    this.init_title();
    this.init_terminal_data();
    this.init_settings();
    this.init_touch();
    this.set_connection_status("disconnected");
    this.reconnectIfNotResponding();

    // The docs https://xtermjs.org/docs/api/terminal/classes/terminal/#resize say
    // "It’s best practice to debounce calls to resize, this will help ensure that
    //  the pty can respond to the resize event before another one occurs."
    // We do NOT debounce, because it strangely breaks everything,
    // as you can see by just resizing the window.
    // this.terminal_resize = debounce(this.terminal_resize, 2000);
  }

  private get_xtermjs_options = (): any => {
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
  };

  private assert_not_closed = (): void => {
    if (this.state === "closed") {
      throw Error("BUG -- Terminal is closed.");
    }
  };

  close = (): void => {
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
  };

  private disconnect = (): void => {
    if (this.conn === undefined) {
      return;
    }
    this.conn.removeAllListeners();
    this.conn.end();
    delete this.conn;
    this.set_connection_status("disconnected");
  };

  private update_settings = (): void => {
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
      this.terminal.options.scrollback = settings.get("scrollback", SCROLLBACK);
    }

    this.terminal_settings = settings;
  };

  connect = async () => {
    try {
      if (this.conn != null) {
        this.conn.removeListener("close", this.connect); // avoid infinite loop
        this.conn.close();
        delete this.conn;
      }
      this.set_connection_status("connecting");
      await this.configureComputeServerId();
      if (this.state == "closed") {
        return;
      }
      const conn = new ConatTerminal({
        path: this.term_path,
        project_id: this.project_id,
        terminalResize: this.terminal_resize,
        openPaths: this.open_paths,
        closePaths: this.close_paths,
        measureSize: this.measureSize,
        options: {
          command: this.command,
          args: this.args,
          cwd: this.workingDir,
          env: this.actions.get_term_env(),
        },
      });
      this.conn = conn as any;
      conn.on("close", this.connect);
      conn.on("kick", this.close_request);
      conn.on("cwd", (cwd) => {
        this.actions.set_terminal_cwd(this.id, cwd);
      });
      conn.on("data", this.handleDataFromProject);
      conn.on("init", (data) => {
        // during init we write a bunch of data to the terminal (everything 
        // so far), and the terminal would respond to some of that data with
        // control codes.  We thus set ignoreData:true, so that during the
        // parsing of this data by the browser terminal, those control codes
        // are ignored.   Not doing this properly was the longterm source of
        // control code corruption in the terminal.
        this.render(data, { ignoreData: true });
      });
      conn.once("ready", () => {
        delete this.last_geom;
        this.set_connection_status("connected");
        this.scroll_to_bottom();
        this.terminal.refresh(0, this.terminal.rows - 1);
        this.init_keyhandler();
        this.measureSize();
        if (this.conn != null && this.conn_write_buffer.length > 0) {
          const buf = this.conn_write_buffer.join("");
          if (buf) {
            this.conn.write(buf);
            this.conn_write_buffer.length = 0;
          }
        }
      });
      if (endswith(this.path, ".term")) {
        touchPath(this.project_id, this.path); // no need to await
      }
      await conn.init();
    } catch (err) {
      this.set_connection_status("disconnected");
      throw err;
    }
  };

  reload = async (): Promise<void> => {
    await this.connect();
  };

  conn_write = (data): void => {
    if (this.state == "closed") {
      return; // no-op  -- see #4918
    }
    if (this.conn === undefined) {
      if (typeof data == "string") {
        this.conn_write_buffer.push(data);
      }
      return;
    }
    this.conn.write(data);
    this.lastSend = Date.now();
  };

  private reconnectIfNotResponding = async () => {
    while (this.state != "closed") {
      if (this.lastSend - this.lastReceive >= MAX_DELAY) {
        await this.connect();
      }
      await delay(MAX_DELAY / 2);
    }
  };

  private handleDataFromProject = (data: any): void => {
    this.assert_not_closed();
    if (!data || typeof data != "string") {
      return;
    }
    this.activity();
    if (this.is_paused) {
      this.render_buffer += data;
    } else {
      this.render(data);
    }
  };

  private activity = () => {
    this.lastReceive = Date.now();
    this.project_actions.flag_file_activity(this.path);
  };

  private render = async (
    data: string,
    { ignoreData = false }: { ignoreData?: boolean } = {},
  ): Promise<void> => {
    if (data == null) {
      return;
    }
    this.assert_not_closed();
    this.history += data;
    if (this.history.length > MAX_HISTORY_LENGTH) {
      this.history = this.history.slice(
        this.history.length - Math.round(MAX_HISTORY_LENGTH / 1.5),
      );
    }
    try {
      this.ignoreData = ignoreData;
      // NOTE: terminal.write takes a cb but not in the way callback expects.
      // Also, terminal.write is NOT async, which was a bug in this code for a while.
      await callback((cb) => {
        this.terminal.write(data, () => {
          cb();
        });
      });
    } catch (err) {
      console.warn(`issue writing data to terminal: ${data}`);
    } finally {
      this.ignoreData = false;
    }
    // tell anyone who waited for output coming back about this
    while (this.render_done.length > 0) {
      this.render_done.pop()?.();
    }
  };

  // blocks until the next call to this.render
  wait_for_next_render = async (): Promise<void> => {
    return new Promise((done, _) => {
      this.render_done.push(done);
    });
  };

  init_title = (): void => {
    this.terminal.onTitleChange((title) => {
      if (title != null) {
        this.actions.set_title(this.id, title);
        this.ask_for_cwd();
      }
    });
  };

  set_connection_status = (status: ConnectionStatus): void => {
    if (this.actions != null) {
      this.actions.set_connection_status(this.id, status);
    }
  };

  touch = async () => {
    if (Date.now() - this.last_active < 70000) {
      touch_project(this.project_id, await this.getComputeServerId());
    }
  };

  init_touch = (): void => {
    this.touch_interval = setInterval(this.touch, 60000);
  };

  init_keyhandler = (): void => {
    if (this.state === "closed") {
      return;
    }
    if (this.keyhandler_initialized) {
      return;
    }
    this.keyhandler_initialized = true;
    this.terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") {
        // ignore this
        return true;
      }
      //       console.log("key", {
      //         type: event.type,
      //         ctrlKey: event.ctrlKey,
      //         metaKey: event.metaKey,
      //         shiftKey: event.shiftKey,
      //         key: event.key,
      //       });

      // record that terminal is being actively used.
      this.last_active = Date.now();

      if (this.is_paused) {
        this.pauseKeyCount += 1;
        if (this.pauseKeyCount >= 4) {
          // otherwise, trying to copy when paused causes it to unpause which is
          // very annoying.  there's a button... but if the user forgets and starts
          // mashing buttons, it still works.
          this.actions.unpause(this.id);
        }
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
  };

  // Try to resize terminal to given number of rows and columns.
  // This should not throw an exception no matter how wrong the input
  // actually is.
  private terminal_resize = (opts: { cols: number; rows: number }) => {
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
  };

  i;

  // Stop ignoring terminal data... but ONLY once
  // the render buffer is also empty.
  no_ignore = async (): Promise<void> => {
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
        if (this.state === "closed") {
          return;
        }
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
  };

  close_request = (): void => {
    this.actions.set_error("Terminal closed by another session.");
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
  };

  private use_subframe = (path: string): boolean => {
    const this_path_ext = filename_extension(this.actions.path);
    if (this_path_ext == "term") {
      // This is a .term tab, so always open the path in a new editor
      // tab (not in the frame tree).
      return false;
    }
    const ext = filename_extension(path);
    const a = file_associations[ext];
    // Latex editor -- ALWAYS open tex files in same frame:
    if (this_path_ext == "tex" && a?.editor == "latex") {
      return true;
    }
    // Open file in this tab of it can be edited as code, or no editor
    // so text is the fallback.
    if (a == null || a.editor == "codemirror") {
      return true;
    }
    return false;
  };

  private open_paths = async (paths: Path[]) => {
    if (!this.is_visible) {
      return;
    }
    const project_actions: ProjectActions = this.actions._get_project_actions();
    let i = 0;
    let foreground = false;
    const compute_server_id = await this.getComputeServerId();
    for (const x of paths) {
      i += 1;
      if (i === paths.length) {
        foreground = true;
      }
      if (x.file != null) {
        const path = x.file;
        if (this.use_subframe(path)) {
          this.actions.open_code_editor_frame({ path, compute_server_id });
        } else {
          project_actions.open_file({
            path,
            foreground,
            compute_server_id,
            explicit: true,
          });
        }
      }
      if (x.directory != null && foreground) {
        project_actions.setComputeServerId(compute_server_id);
        project_actions.open_directory(x.directory);
      }
    }
  };

  _close_path = (path: string): void => {
    const project_actions = this.actions._get_project_actions();
    project_actions.close_tab(path);
  };

  close_paths = (paths: Path[]): void => {
    if (!this.is_visible) {
      return;
    }
    for (const x of paths) {
      if (x.file != null) {
        this._close_path(x.file);
      }
    }
  };

  resize = (rows: number, cols: number): void => {
    if (this.terminal.cols === cols && this.terminal.rows === rows) {
      // no need to resize
      return;
    }
    this.terminal_resize({ rows, cols });
  };

  pause = (): void => {
    this.is_paused = true;
    this.pauseKeyCount = 0;
  };

  unpause = (): void => {
    this.is_paused = false;
    this.render(this.render_buffer);
    this.render_buffer = "";
  };

  ask_for_cwd = (): void => {
    this.conn_write({ cmd: "cwd" });
  };

  kick_other_users_out(): void {
    // @ts-ignore
    this.conn?.kick();
    this.measureSize({ kick: true });
  }

  kill = async () => {
    this.conn_write({ cmd: "kill" });
    await this.connect();
  };

  set_command(command: string | undefined, args: string[] | undefined): void {
    this.command = command;
    this.args = args;
    this.conn_write({ cmd: "set_command", command, args });
  }

  init_terminal_data(): void {
    this.terminal.onData((data) => {
      if (this.ignoreData) {
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
    this.terminal.options.fontSize = font_size;
  }

  getOption(option: string): any {
    return this.terminal.options[option];
  }

  measureSize = ({ kick }: { kick?: boolean } = {}): void => {
    const geom = this.fitAddon?.proposeDimensions();
    if (geom == null) {
      return;
    }
    const { rows, cols } = geom;
    if (
      !kick &&
      this.last_geom?.rows === rows &&
      this.last_geom?.cols === cols
    ) {
      return;
    }
    this.last_geom = { rows, cols };
    this.conn_write({ cmd: "size", rows, cols, kick });
  };

  copy = (): void => {
    const sel: string = this.terminal.getSelection();
    set_buffer(sel);
    this.terminal.focus();
  };

  paste = (): void => {
    this.terminal.clearSelection();
    this.terminal.paste(get_buffer());
    this.terminal.focus();
  };

  scroll_to_bottom = (): void => {
    // Upstream bug workaround -- we scroll to top first, then bottom
    // entirely to workaround a bug. This is NOT fixed by the Oct 2018
    // term.js release, despite it touching relevant code.
    this.terminal.scrollToTop();
    this.terminal.scrollToBottom();
  };

  getComputeServerId = async (): Promise<number> => {
    const computeServerAssociations =
      webapp_client.project_client.computeServers(this.project_id);
    return (
      (await computeServerAssociations.getServerIdForPath(this.term_path)) ?? 0
    );
  };

  // This is called when connecting to in some cases give the user the option
  // to run the terminal on a different compute server if the compute server
  // is not set for this terminal frame and:
  //   - the ambient path has the compute server set to a positive number
  //   - or the current default compute server (what's selected in the file explorer) is positive.
  private configureComputeServerId = async () => {
    const computeServerAssociations =
      webapp_client.project_client.computeServers(this.project_id);
    const cur = await computeServerAssociations.getServerIdForPath(
      this.term_path,
    );
    if (cur != null) {
      // nothing to do -- it's already explicitly set.
      return;
    }
    const id = await computeServerAssociations.getServerIdForPath(this.path);
    if (!id) {
      // the ambient path is on the project, so nothing to do
      return;
    }
    if (
      await redux
        .getActions("page")
        .popconfirm(
          modalParams({ current: 0, target: id, path: this.term_path }),
        )
    ) {
      // yes, switch it
      computeServerAssociations.connectComputeServerToPath({
        id,
        path: this.term_path,
      });
      await computeServerAssociations.save();
    }
  };
}

async function touchPath(project_id: string, path: string): Promise<void> {
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
