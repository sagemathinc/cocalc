/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// TODO: we should refactor our code to not have these window/document/$ references here.
declare let window, document, $;

import { join } from "path";
import * as async from "async";
import { isEqual } from "lodash";
import { Set, List, fromJS, Map } from "immutable";
import { client_db } from "@cocalc/util/schema";
import {
  ConfigurationAspect,
  Configuration,
  ProjectConfiguration,
  get_configuration,
  LIBRARY_INDEX_FILE,
  is_available as feature_is_available,
} from "./project_configuration";
import { query as client_query } from "./frame-editors/generic/client";
import { callback } from "awaiting";
import { callback2, retry_until_success } from "@cocalc/util/async-utils";
import { exec } from "./frame-editors/generic/client";
import { API } from "./project/websocket/api";
import { in_snapshot_path, NewFilenames, normalize } from "./project/utils";
import { NEW_FILENAMES } from "@cocalc/util/db-schema";
import { transform_get_url } from "./project/transform-get-url";
import { OpenFiles } from "./project/open-files";
import { log_opened_time, open_file, log_file_open } from "./project/open-file";
import * as project_file from "./project-file";
import { get_editor } from "./editors/react-wrapper";
import * as misc from "@cocalc/util/misc";
const { MARKERS } = require("@cocalc/util/sagews");
import { alert_message } from "./alerts";
import { webapp_client } from "./webapp-client";
const { defaults, required } = misc;
import { set_url } from "./history";
import { delete_files } from "./project/delete-files";
import { get_directory_listing2 as get_directory_listing } from "./project/directory-listing";
import { Actions, project_redux_name, redux } from "./app-framework";
import { ModalInfo, ProjectStore, ProjectStoreState } from "./project_store";
import { ProjectEvent } from "./project/history/types";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/compute-images";
import { download_href, url_href } from "./project/utils";
import { ensure_project_running } from "./project/project-start-warning";
import { download_file, open_new_tab, open_popup_window } from "./misc";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { IconName } from "./components";

const BAD_FILENAME_CHARACTERS = "\\";
const BAD_LATEX_FILENAME_CHARACTERS = '\'"()"~%$';
const BANNED_FILE_TYPES = ["doc", "docx", "pdf", "sws"];

const FROM_WEB_TIMEOUT_S = 45;

export const QUERIES = {
  project_log: {
    query: {
      id: null,
      project_id: null,
      account_id: null,
      time: null,
      event: null,
    },
  },

  project_log_all: {
    query: {
      id: null,
      project_id: null,
      account_id: null,
      time: null,
      event: null,
    },
  },

  public_paths: {
    query: {
      id: null,
      project_id: null,
      path: null,
      name: null,
      description: null,
      disabled: null,
      unlisted: null,
      authenticated: null,
      created: null,
      license: null,
      last_edited: null,
      last_saved: null,
      counter: null,
      compute_image: null,
    },
  },
};

interface FetchDirectoryListingOpts {
  path?: string;
  force?: boolean;
  cb?: () => void;
}

// src: where the library files are
// start: open this file after copying the directory
const LIBRARY = {
  first_steps: {
    src: "/ext/library/first-steps/src",
    start: "first-steps.tasks",
  },
};

const must_define = function (redux) {
  if (redux == null) {
    throw Error(
      "you must explicitly pass a redux object into each function in project_store"
    );
  }
};
const _init_library_index_ongoing = {};
const _init_library_index_cache = {};

export const FILE_ACTIONS = {
  compress: {
    name: "Compress",
    icon: "compress" as IconName,
    allows_multiple_files: true,
  },
  delete: {
    name: "Delete",
    icon: "trash" as IconName,
    allows_multiple_files: true,
  },
  rename: {
    name: "Rename",
    icon: "swap" as IconName,
    allows_multiple_files: false,
  },
  duplicate: {
    name: "Duplicate",
    icon: "clone" as IconName,
    allows_multiple_files: false,
  },
  move: {
    name: "Move",
    icon: "move" as IconName,
    allows_multiple_files: true,
  },
  copy: {
    name: "Copy",
    icon: "files" as IconName,
    allows_multiple_files: true,
  },
  share: {
    name: "Public",
    icon: "share-square" as IconName,
    allows_multiple_files: false,
  },
  download: {
    name: "Download",
    icon: "cloud-download" as IconName,
    allows_multiple_files: true,
  },
  upload: {
    name: "Upload",
    icon: "upload" as IconName,
  },
  create: {
    name: "Create",
    icon: "plus-circle" as IconName,
  },
} as const;

export class ProjectActions extends Actions<ProjectStoreState> {
  public project_id: string;
  private _last_history_state: string;
  private last_close_timer: number;
  private _activity_indicator_timers: { [key: string]: number };
  private _set_directory_files_lock: { [key: string]: Function[] };
  private _init_done = false;
  private new_filename_generator;
  public open_files?: OpenFiles;
  private modal?: ModalInfo;

  constructor(a, b) {
    super(a, b);
    this.new_filename_generator = new NewFilenames("", false);
    this._activity_indicator_timers = {};
    this.open_files = new OpenFiles(this);
  }

  public async api(): Promise<API> {
    return await webapp_client.project_client.api(this.project_id);
  }

  destroy = (): void => {
    if (this.open_files == null) return;
    must_define(this.redux);
    this.close_all_files();
    for (const table in QUERIES) {
      this.remove_table(table);
    }
    this.open_files.close();
    delete this.open_files;
  };

  private save_session(): void {
    this.redux.getActions("page").save_session();
  }

  remove_table = (table: string): void => {
    this.redux.removeTable(project_redux_name(this.project_id, table));
  };

  // Records in the backend database that we are actively
  // using this project and wakes up the project.
  // This resets the idle timeout, among other things.
  // This is throttled, so multiple calls are spaced out.
  touch = async (): Promise<void> => {
    try {
      await webapp_client.project_client.touch(this.project_id);
    } catch (err) {
      // nonfatal.
      console.warn(`unable to touch ${this.project_id} -- ${err}`);
    }
  };

  public _ensure_project_is_open(cb): void {
    const s: any = this.redux.getStore("projects");
    if (!s.is_project_open(this.project_id)) {
      (this.redux.getActions("projects") as any).open_project({
        project_id: this.project_id,
        switch_to: true,
      });
      s.wait_until_project_is_open(this.project_id, 30, cb);
    } else {
      cb();
    }
  }

  public get_store(): ProjectStore | undefined {
    if (this.redux.hasStore(this.name)) {
      return this.redux.getStore<ProjectStoreState, ProjectStore>(this.name);
    } else {
      return undefined;
    }
  }

  clear_all_activity(): void {
    this.setState({ activity: undefined });
  }

  async custom_software_reset(): Promise<void> {
    // 1. delete the sentinel file that marks copying over the accompanying files
    // 2. restart project. This isn't strictly necessary and a TODO for later, because
    // this would have to do preciesly what kucalc's project init does.
    const sentinel = ".cocalc-project-init-done";
    await exec({
      timeout: 10,
      project_id: this.project_id,
      command: "rm",
      args: ["-f", sentinel],
      err_on_exit: false,
      bash: false,
    });
    this.toggle_custom_software_reset(false);
    const projects_actions = this.redux.getActions("projects") as any;
    projects_actions.restart_project(this.project_id);
  }

  toggle_custom_software_reset(show: boolean): void {
    this.setState({ show_custom_software_reset: show });
  }

  toggle_panel(name: keyof ProjectStoreState, show?: boolean): void {
    if (show != null) {
      this.setState({ [name]: show });
    } else {
      const store = this.get_store();
      if (store == undefined) return;
      this.setState({ [name]: !store.get(name) });
    }
  }

  // if ext == null → hide dialog; otherwise ask for name with given extension
  ask_filename(ext?: string): void {
    if (ext != null) {
      // this is either cached or undefined; that's good enough
      const filenames = this.get_filenames_in_current_dir();
      // this is the type of random name generator
      const acc_store = this.redux.getStore("account") as any;
      const dflt = NewFilenames.default_family;
      const type = (function () {
        if (acc_store != null) {
          return acc_store.getIn(["other_settings", NEW_FILENAMES]);
        } else {
          return dflt;
        }
      })();
      this.new_filename_generator.set_ext(ext);
      this.setState({
        new_filename: this.new_filename_generator.gen(type, filenames),
      });
    }
    this.setState({ ext_selection: ext });
  }

  set_new_filename_family(family: string): void {
    const acc_table = redux.getTable("account");
    if (acc_table != null) {
      acc_table.set({ other_settings: { [NEW_FILENAMES]: family } });
    }
  }

  toggle_library(show?: boolean): void {
    this.toggle_panel("show_library", show);
  }

  set_url_to_path(current_path): void {
    if (current_path.length > 0 && !misc.endswith(current_path, "/")) {
      current_path += "/";
    }
    this.push_state(`files/${current_path}`);
  }

  _url_in_project(local_url): string {
    return `/projects/${this.project_id}/${misc.encode_path(local_url)}`;
  }

  push_state(local_url?: string): void {
    if (local_url == null) {
      local_url = this._last_history_state;
    }
    if (local_url == null) {
      local_url = `files/`;
    }
    this._last_history_state = local_url;
    set_url(this._url_in_project(local_url));
  }

  move_file_tab(opts: { old_index: number; new_index: number }): void {
    if (this.open_files == null) return;
    this.open_files.move(opts);
    this.save_session();
  }

  // Closes a file tab
  // Also closes file references.
  // path not always defined, see #3440
  public close_tab(path: string | undefined): void {
    if (path == null) return;
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const open_files_order = store.get("open_files_order");
    const active_project_tab = store.get("active_project_tab");
    const closed_index = open_files_order.indexOf(path);
    const { size } = open_files_order;
    if (misc.path_to_tab(path) === active_project_tab) {
      let next_active_tab: string | undefined = undefined;
      if (size === 1) {
        next_active_tab = "files";
      } else {
        let path: string | undefined;

        if (closed_index === size - 1) {
          path = open_files_order.get(closed_index - 1);
        } else {
          path = open_files_order.get(closed_index + 1);
        }
        if (path != null) {
          next_active_tab = misc.path_to_tab(path);
        }
      }
      if (next_active_tab != null) {
        this.set_active_tab(next_active_tab);
      }
    }
    if (closed_index === size - 1) {
      this.clear_ghost_file_tabs();
    } else {
      this.add_a_ghost_file_tab();
    }
    window.clearTimeout(this.last_close_timer);
    this.last_close_timer = window.setTimeout(this.clear_ghost_file_tabs, 5000);
    this.close_file(path);
  }

  // Expects one of ['files', 'new', 'log', 'search', 'settings']
  //            or a file_redux_name
  // Pushes to browser history
  // Updates the URL
  public set_active_tab(
    key: string,
    opts: {
      update_file_listing?: boolean;
      change_history?: boolean;
      new_ext?: string;
    } = {
      update_file_listing: true,
      change_history: true,
    }
  ): void {
    const store = this.get_store();
    if (store == undefined) return; // project closed
    const prev_active_project_tab = store.get("active_project_tab");
    if (!opts.change_history && prev_active_project_tab === key) {
      // already active -- nothing further to do
      return;
    }
    if (
      prev_active_project_tab !== key &&
      misc.startswith(prev_active_project_tab, "editor-")
    ) {
      this.hide_file(misc.tab_to_path(prev_active_project_tab));
    }

    const change: any = { active_project_tab: key };
    switch (key) {
      case "files":
        if (opts.change_history) {
          this.set_url_to_path(
            store.get("current_path") != null ? store.get("current_path") : ""
          );
        }
        if (opts.update_file_listing) {
          this.fetch_directory_listing();
        }
        break;
      case "new":
        change.file_creation_error = undefined;
        if (opts.change_history) {
          this.push_state(`new/${store.get("current_path")}`);
        }
        const new_fn = require("./account").default_filename(
          opts.new_ext,
          this.project_id
        );
        this.set_next_default_filename(new_fn);
        break;
      case "log":
        if (opts.change_history) {
          this.push_state("log");
        }
        break;
      case "search":
        if (opts.change_history) {
          this.push_state(`search/${store.get("current_path")}`);
        }
        break;
      case "settings":
        if (opts.change_history) {
          this.push_state("settings");
        }
        break;
      case "info":
        if (opts.change_history) {
          this.push_state("info");
        }
        break;
      default:
        // editor...
        const path = misc.tab_to_path(key);
        if (path == null) {
          throw Error(`must be an editor path but is ${key}`);
        }
        this.redux
          .getActions("file_use")
          ?.mark_file(this.project_id, path, "open");
        if (opts.change_history) {
          this.push_state(`files/${path}`);
        }
        this.set_current_path(misc.path_split(path).head);

        // Reopen the file if relationship has changed
        const is_public =
          (redux.getStore("projects") as any).get_my_group(this.project_id) ===
          "public";

        const info = store.get("open_files").getIn([path, "component"]);
        if (info == null) {
          // shouldn't happen...
          return;
        }
        const was_public = info.is_public;
        if (is_public !== was_public) {
          // re-open the file, which will "fix" the public state to be right.
          this.open_file({ path });
        }

        // Finally, ensure that the react/redux stuff is initialized, so
        // the component will be rendered.  This happens if you open a file
        // in the background but don't actually switch to that tab, then switch
        // there later.  It's an optimization and it's very common due to
        // session restore (where all tabs are restored).
        if (info.redux_name == null || info.Editor == null) {
          if (this.open_files == null) return;
          // We configure the Editor component and redux.  This is async,
          // due to the Editor component being async loaded only when needed,
          // e.g., we don't want to load all of Slate for users that aren't
          // using Slate.  However, we wrap this in a function that we call,
          // since there is no need to wait for this to be done before showing
          // the tab (with a Loading spinner).  In fact, waiting would make
          // the UI appear to weirdly block the first time you open a given type
          // of file.
          (async () => {
            const { name, Editor } = await this.init_file_react_redux(
              path,
              is_public
            );
            if (this.open_files == null) return;
            info.redux_name = name;
            info.Editor = Editor;
            // IMPORTANT: we make a *copy* of info below to trigger an update
            // of the component that displays this editor.  Otherwise, the user
            // would just see a spinner until they tab away and tab back.
            this.open_files.set(path, "component", { ...info });
            // just like in the case where it is already loaded, we have to "show" it
            // this is important, because e.g. the store has a "visible" field, which stays undefined
            // which in turn causes e.g. https://github.com/sagemathinc/cocalc/issues/5398
            this.show_file(path);
          })();
        } else {
          this.show_file(path);
        }
    }
    this.setState(change);
  }

  add_a_ghost_file_tab(): void {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const current_num = store.get("num_ghost_file_tabs");
    this.setState({ num_ghost_file_tabs: current_num + 1 });
  }

  clear_ghost_file_tabs(): void {
    this.setState({ num_ghost_file_tabs: 0 });
  }

  set_next_default_filename(next): void {
    this.setState({ default_filename: next });
  }

  async set_activity(opts): Promise<void> {
    opts = defaults(opts, {
      id: required, // client must specify this, e.g., id=misc.uuid()
      status: undefined, // status update message during the activity -- description of progress
      stop: undefined, // activity is done  -- can pass a final status message in.
      error: undefined,
    }); // describe an error that happened
    const store = this.get_store();
    if (store == undefined) {
      return;
    }

    // If there is activity it's also a good opportunity to
    // express that we are interested in this project.
    this.touch();

    let x =
      store.get("activity") != null ? store.get("activity").toJS() : undefined;
    if (x == null) {
      x = {};
    }
    // Actual implementation of above specified API is VERY minimal for
    // now -- just enough to display something to user.
    if (opts.status != null) {
      x[opts.id] = opts.status;
      this.setState({ activity: x });
    }
    if (opts.error != null) {
      const { error } = opts;
      if (error === "") {
        this.setState({ error });
      } else {
        this.setState({
          error: (
            (store.get("error") != null ? store.get("error") : "") +
            "\n" +
            error
          ).trim(),
        });
      }
    }
    if (opts.stop != null) {
      if (opts.stop) {
        x[opts.id] = opts.stop; // of course, just gets deleted below but that is because use is simple still
      }
      delete x[opts.id];
      this.setState({ activity: x });
    }
  }

  /**
   *
   * Report a log event to the backend -- will indirectly result in a new entry in the store...
   * Allows for updating logs via merging if `id` is provided
   *
   * Returns the random log entry uuid. If called later with that id, then the time isn't
   * changed and the event is merely updated.
   * Returns undefined if log event is ignored
   */
  // NOTE: we can't just make this log function async since it returns
  // an id that we use later to update the log, and we would have
  // to change whatever client code uses that id to be async.  Maybe later.
  // So we make the new function async_log below.
  log(event: ProjectEvent): string | undefined;
  log(
    event: Partial<ProjectEvent>,
    id: string,
    cb?: (err?: any) => void
  ): string | undefined;
  log(event: ProjectEvent, id?: string, cb?: Function): string | undefined {
    const my_role = (this.redux.getStore("projects") as any).get_my_group(
      this.project_id
    );
    if (["public", "admin"].indexOf(my_role) != -1) {
      // Ignore log events for *both* admin and public.
      // Admin gets to be secretive (also their account_id --> name likely wouldn't be known to users).
      // Public users don't log anything.
      if (cb != null) cb();
      return; // ignore log events
    }
    const obj: any = {
      event,
      project_id: this.project_id,
    };
    if (!id) {
      // new log entry
      id = misc.uuid();
      obj.time = misc.server_time();
    }
    obj.id = id;
    const query = { project_log: obj };
    webapp_client.query({
      query,
      cb: (err) => {
        if (err) {
          // TODO: what do we want to do if a log doesn't get recorded?
          // (It *should* keep trying and store that in localStorage, and try next time, etc...
          //  of course done in a systematic way across everything.)
          console.warn("error recording a log entry: ", err, event);
        }
        if (cb != null) cb(err);
      },
    });

    if (window.parent != null) {
      // (I think this is always defined.)
      // We also fire a postMessage.  This allows the containing
      // iframe (if there is one), or other parts of the page, to
      // be alerted of any logged event, which can be very helpful
      // when building applications.  See
      //      https://github.com/sagemathinc/cocalc/issues/4145
      // If embedded in an iframe, it is the embedding window.
      // If not in an iframe, seems to be the window itself.
      // I copied the {source:?,payload:?} format from react devtools.
      window.parent.postMessage(
        { source: "cocalc-project-log", payload: query },
        "*"
      );
    }

    return id;
  }

  public async async_log(event: ProjectEvent, id?: string): Promise<void> {
    await callback(this.log.bind(this), event, id);
  }

  public log_opened_time(path): void {
    log_opened_time(this.project_id, path);
  }

  // Save the given file in this project (if it is open) to disk.
  save_file(opts): void {
    opts = defaults(opts, { path: required });
    if (
      (!this.redux.getStore("projects") as any).is_project_open(this.project_id)
    ) {
      return; // nothing to do regarding save, since project isn't even open
    }
    // NOTE: someday we could have a non-public relationship to project, but still open an individual file in public mode
    const store = this.get_store();
    if (store == undefined) {
      return;
    }

    const path_data = store.get("open_files").getIn([opts.path, "component"]);
    const is_public = path_data ? path_data.is_public : false;

    project_file.save(opts.path, this.redux, this.project_id, is_public);
  }

  // Save all open files in this project
  save_all_files(): void {
    const s: any = this.redux.getStore("projects");
    if (!s.is_project_open(this.project_id)) {
      return; // nothing to do regarding save, since project isn't even open
    }
    const group = s.get_my_group(this.project_id);
    if (group == null || group === "public") {
      return; // no point in saving if not open enough to even know our group or if our relationship to entire project is "public"
    }
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    store.get("open_files").forEach((val, path) => {
      const component = val.get("component");
      if (component == null) {
        // This happens, e.g., if you have a tab for a file,
        // but it hasn't been focused, so there's no actual
        // information to save (basically a background tab
        // that has not yet been initialized).
        return;
      }
      const { is_public } = component;
      project_file.save(path, this.redux, this.project_id, is_public);
    });
  }

  public open_in_new_browser_window(path: string, fullscreen = "kiosk"): void {
    let url = join(appBasePath, this._url_in_project(`files/${path}`));
    url += "?session=";
    if (fullscreen) {
      url += `&fullscreen=${fullscreen}`;
    }
    const width = Math.round(window.screen.width * 0.75);
    const height = Math.round(window.screen.height * 0.75);
    open_popup_window(url, { width, height });
  }

  public async open_word_document(path): Promise<void> {
    // Microsoft Word Document
    alert_message({
      type: "info",
      message: `Opening converted plain text file instead of '${path}...`,
    });
    try {
      const converted: string = await this.convert_docx_file(path);
      await this.open_file({
        path: converted,
        foreground: true,
        foreground_project: true,
      });
    } catch (err) {
      alert_message({
        type: "error",
        message: `Error converting Microsoft docx file -- ${err}`,
      });
    }
  }

  // Open the given file in this project.
  public async open_file(opts): Promise<void> {
    await open_file(this, opts);
  }

  /* Initialize the redux store and react component for editing
     a particular file.
  */
  async initFileRedux(
    path: string,
    is_public: boolean = false
  ): Promise<string | undefined> {
    // LAZY IMPORT, so that editors are only available
    // when you are going to use them.  Helps with code splitting.
    await import("./editors/register-all");

    // Initialize the file's store and actions
    const name = await project_file.initializeAsync(
      path,
      this.redux,
      this.project_id,
      is_public
    );
    return name;
  }

  private async init_file_react_redux(
    path: string,
    is_public: boolean
  ): Promise<{ name: string | undefined; Editor: any }> {
    const name = await this.initFileRedux(path, is_public);

    // Make the Editor react component
    const Editor = await project_file.generateAsync(
      path,
      this.redux,
      this.project_id,
      is_public
    );

    // Log that we opened the file.
    log_file_open(this.project_id, path);
    return { name, Editor };
  }

  get_scroll_saver_for(path: string) {
    if (path != null) {
      return (scroll_position) => {
        const store = this.get_store();
        if (
          // Ensure prerequisite things exist
          store == undefined ||
          store.get("open_files") == undefined ||
          store.get("open_files").getIn([path, "component"]) == undefined
        ) {
          return;
        }
        // WARNING: Saving scroll position does NOT trigger a rerender. This is intentional.
        const info = store!.get("open_files").getIn([path, "component"]);
        info.scroll_position = scroll_position; // Yes, this mutates the store silently.
        return scroll_position;
      };
    }
  }

  // If the given path is open, and editor supports going to line,
  // moves to the given line.
  // Otherwise, does nothing.
  public goto_line(path, line, cursor?: boolean, focus?: boolean): void {
    const a: any = redux.getEditorActions(this.project_id, path);
    if (a == null) {
      // try non-react editor
      const editor = get_editor(this.project_id, path);
      if (
        editor != null &&
        typeof editor.programmatical_goto_line === "function"
      ) {
        editor.programmatical_goto_line(line);
      }
    } else {
      if (typeof a.programmatical_goto_line === "function") {
        a.programmatical_goto_line(line, cursor, focus);
      }
    }
  }

  // Called when a file tab is shown.
  private show_file(path): void {
    const a: any = redux.getEditorActions(this.project_id, path);
    if (a == null) {
      // try non-react editor
      const editor = get_editor(this.project_id, path);
      if (editor != null) editor.show();
    } else {
      if (typeof a.show === "function") a.show();
    }
  }

  // Called when a file tab is put in the background due to
  // another tab being made active.
  private hide_file(path): void {
    const a: any = redux.getEditorActions(this.project_id, path);
    if (a == null) {
      // try non-react editor
      const editor = get_editor(this.project_id, path);
      if (editor != null) editor.hide();
    } else {
      if (typeof a.hide === "function") a.hide();
    }
  }

  // Used by open/close chat below.
  private set_chat_state(path: string, is_chat_open: boolean): void {
    if (this.open_files == null) return;
    this.open_files.set(path, "is_chat_open", is_chat_open);
  }

  // Open side chat for the given file, assuming the file is open, store is initialized, etc.
  open_chat(opts) {
    opts = defaults(opts, { path: required });
    // First create the chat actions:
    require("./chat/register").init(
      misc.meta_file(opts.path, "chat"),
      this.redux,
      this.project_id
    );
    const { local_storage } = require("./editor");
    local_storage(this.project_id, opts.path, "is_chat_open", true);
    // Only then set state to say that the chat is opened!
    // Otherwise when the opened chat is rendered actions is
    // randomly not defined, and things break.
    this.set_chat_state(opts.path, true);
  }

  // Close side chat for the given file, assuming the file itself is open
  close_chat(opts) {
    opts = defaults(opts, { path: required });
    const { local_storage } = require("./editor");
    local_storage(this.project_id, opts.path, "is_chat_open", false);
    this.set_chat_state(opts.path, false);
  }

  set_chat_width(opts): void {
    opts = defaults(opts, {
      path: required,
      width: required,
    }); // between 0 and 1
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const open_files = store.get("open_files");
    if (open_files != null) {
      if (this.open_files == null) return;
      const width = misc.ensure_bound(opts.width, 0.05, 0.95);
      const { local_storage } = require("./editor");
      local_storage(this.project_id, opts.path, "chat_width", width);
      this.open_files.set(opts.path, "chat_width", width);
    }
  }

  // OPTIMIZATION: Some possible performance problems here. Debounce may be necessary
  flag_file_activity(filename: string): void {
    if (this.open_files == null) return;
    if (filename == null || !this.open_files.has(filename)) {
      // filename invalid or not currently open, see
      //  https://github.com/sagemathinc/cocalc/issues/4717
      return;
    }

    const timer = this._activity_indicator_timers[filename];
    if (timer != null) {
      window.clearTimeout(timer);
    }

    const set_inactive = () => {
      if (!this.open_files?.has(filename)) return;
      this.open_files.set(filename, "has_activity", false);
    };

    this._activity_indicator_timers[filename] = window.setTimeout(
      set_inactive,
      1000
    );

    this.open_files.set(filename, "has_activity", true);
  }

  private async convert_docx_file(filename): Promise<string> {
    const conf = await this.init_configuration("main");
    if (conf != null && conf.capabilities.pandoc === false) {
      throw new Error(
        "Pandoc not installed – unable to convert docx to markdown."
      );
    }
    const md_fn = misc.change_filename_extension(filename, "md");
    // pandoc -s example30.docx -t gfm [or markdown] -o example35.md
    await webapp_client.project_client.exec({
      project_id: this.project_id,
      command: "pandoc",
      args: ["-s", filename, "-t", "gfm", "-o", md_fn],
    });
    return md_fn;
  }

  // Closes all files and removes all references
  close_all_files() {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const file_paths = store.get("open_files");
    file_paths.map((obj, path) => {
      const component_data = obj.getIn(["component"]);
      const is_public = component_data ? component_data.is_public : undefined;
      project_file.remove(path, this.redux, this.project_id, is_public);
    });

    this.open_files?.close_all();
  }

  // Closes the file and removes all references.
  // Does not update tabs
  close_file(path: string): void {
    path = normalize(path);
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const open_files = store.get("open_files");
    const component_data = open_files.getIn([path, "component"]);
    if (component_data == null) return; // nothing to do since already closed.
    this.open_files?.delete(path);
    project_file.remove(
      path,
      this.redux,
      this.project_id,
      component_data.is_public
    );
    this.save_session();
  }

  // Makes this project the active project tab
  foreground_project(change_history = true): void {
    this._ensure_project_is_open((err) => {
      if (err) {
        // TODO!
        console.warn(
          "error putting project in the foreground: ",
          err,
          this.project_id
        );
      } else {
        (this.redux.getActions("projects") as any).foreground_project(
          this.project_id,
          change_history
        );
      }
    });
  }

  open_directory(path, change_history = true, show_files = true): void {
    path = normalize(path);
    this._ensure_project_is_open(async (err) => {
      if (err) {
        // TODO!
        console.log(
          "error opening directory in project: ",
          err,
          this.project_id,
          path
        );
      } else {
        if (path[path.length - 1] === "/") {
          path = path.slice(0, -1);
        }
        this.foreground_project(change_history);
        this.set_current_path(path);
        const store = this.get_store();
        if (store == undefined) {
          return;
        }
        if (show_files) {
          this.set_active_tab("files", {
            update_file_listing: false,
            change_history: change_history,
          });
        }
        this.set_all_files_unchecked();
      }
    });
  }

  // ONLY updates current path
  // Does not push to URL, browser history, or add to analytics
  // Use internally or for updating current path in background
  set_current_path(path: string = ""): void {
    path = normalize(path);
    if (Number.isNaN(path as any)) {
      // SMELL: Track from history.coffee
      path = "";
    }
    if (typeof path !== "string") {
      (window as any).cpath_args = arguments;
      throw Error(
        "Current path should be a string. Received arguments are available in window.cpath_args"
      );
    }
    // Set the current path for this project. path is either a string or array of segments.
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    let history_path = store.get("history_path") || "";
    const is_adjacent =
      path.length > 0 && !(history_path + "/").startsWith(path + "/");
    // given is_adjacent is false, this tests if it is a subdirectory
    const is_nested = path.length > history_path.length;
    if (is_adjacent || is_nested) {
      history_path = path;
    }
    if (store.get("current_path") != path) {
      this.clear_file_listing_scroll();
    }
    this.setState({
      current_path: path,
      history_path,
      page_number: 0,
      most_recent_file_click: undefined,
    });

    this.fetch_directory_listing();
  }

  set_file_search(search): void {
    this.setState({
      file_search: search,
      page_number: 0,
      file_action: undefined,
      most_recent_file_click: undefined,
      create_file_alert: false,
    });
  }

  // Update the directory listing cache for the given path
  // Uses current path if path not provided
  fetch_directory_listing(opts_args?: FetchDirectoryListingOpts): void {
    let status;
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    const opts: FetchDirectoryListingOpts = defaults(opts_args, {
      path: store.get("current_path"),
      force: false, // WARNING: THINK VERY HARD BEFORE YOU USE force
      cb: undefined,
    });

    if (opts.force && opts.path != null) {
      // always update our interest.
      store.get_listings().watch(opts.path, true);
    }

    // In the vast majority of cases, you just want to look at the data.
    // Very rarely should you need something to execute exactly after this
    let { path } = opts;
    //if DEBUG then console.log('ProjectStore::fetch_directory_listing, opts:', opts, opts.cb)
    if (path == null) {
      // nothing to do if path isn't defined -- there is no current path -- see https://github.com/sagemathinc/cocalc/issues/818
      return;
    }

    if (this._set_directory_files_lock == null) {
      this._set_directory_files_lock = {};
    }
    const _key = `${path}`;
    // this makes sure cb is being called, even when there are concurrent requests
    if (this._set_directory_files_lock[_key] != null) {
      // currently doing it already
      if (opts.cb != null) {
        this._set_directory_files_lock[_key].push(opts.cb);
      }
      //if DEBUG then console.log('ProjectStore::fetch_directory_listing aborting:', _key, opts)
      return;
    }
    this._set_directory_files_lock[_key] = [];
    // Wait until user is logged in, project store is loaded enough
    // that we know our relation to this project, namely so that
    // get_my_group is defined.
    const id = misc.uuid();
    if (path) {
      status = `Loading file list - ${misc.trunc_middle(path, 30)}`;
    } else {
      status = "Loading file list";
    }
    this.set_activity({ id, status });
    let my_group: any;
    let the_listing: any;
    async.series(
      [
        (cb) => {
          // make sure the user type is known;
          // otherwise, our relationship to project
          // below can't be determined properly.
          this.redux.getStore("account").wait({
            until: (s) =>
              (s.get("is_logged_in") && s.get("account_id")) ||
              !s.get("is_logged_in"),
            cb: cb,
          });
        },

        (cb) => {
          const projects_store = this.redux.getStore("projects");
          // make sure that our relationship to this project is known.
          if (projects_store == null) {
            cb("projects_store not yet initialized");
            return;
          }
          projects_store.wait({
            until: (s) => (s as any).get_my_group(this.project_id),
            timeout: 30,
            cb: (err, group) => {
              my_group = group;
              cb(err);
            },
          });
        },
        async (cb) => {
          store = this.get_store();
          if (store == null) {
            cb("store no longer defined");
            return;
          }
          if (path == null) {
            path = store.get("current_path");
          }
          try {
            the_listing = await get_directory_listing({
              project_id: this.project_id,
              path,
              hidden: true,
              max_time_s: 15 * 60, // keep trying for up to 15 minutes
              group: my_group,
            });
          } catch (err) {
            cb(err.message);
            return;
          }
          cb();
        },
      ],
      (err) => {
        this.set_activity({ id, stop: "" });
        // Update the path component of the immutable directory listings map:
        store = this.get_store();
        if (store == undefined) {
          return;
        }
        if (err && !misc.is_string(err)) {
          err = misc.to_json(err);
        }
        if (path == null) throw Error("bug"); // make typescript happy
        if (the_listing != null) {
          const map = store
            .get("directory_listings")
            .set(path, err ? err : fromJS(the_listing.files));
          this.setState({ directory_listings: map });
        }
        // done! releasing lock, then executing callback(s)
        const cbs = this._set_directory_files_lock[_key];
        delete this._set_directory_files_lock[_key];
        for (const cb of cbs != null ? cbs : []) {
          //if DEBUG then console.log('ProjectStore::fetch_directory_listing cb from lock', cb)
          if (typeof cb === "function") {
            cb();
          }
        }
        //if DEBUG then console.log('ProjectStore::fetch_directory_listing cb', opts, opts.cb)
        if (typeof opts.cb === "function") {
          opts.cb();
        }
      }
    );
  }

  public async fetch_directory_listing_directly(path: string): Promise<void> {
    const store = this.get_store();
    if (store == null) return;
    const listings = store.get_listings();
    try {
      const files = await listings.get_listing_directly(path);
      const directory_listings = store
        .get("directory_listings")
        .set(path, fromJS(files));
      this.setState({ directory_listings });
    } catch (err) {
      console.warn(`Unable to fetch all files -- "${err}"`);
    }
  }

  // Sets the active file_sort to next_column_name
  set_sorted_file_column(column_name): void {
    let is_descending;
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const current = store.get("active_file_sort");
    if (current.get("column_name") === column_name) {
      is_descending = !current.get("is_descending");
    } else {
      is_descending = false;
    }
    const next_file_sort = current
      .set("is_descending", is_descending)
      .set("column_name", column_name);
    this.setState({ active_file_sort: next_file_sort });
  }

  // Increases the selected file index by 1
  // undefined increments to 0
  increment_selected_file_index(): void {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const selected_index = store.get("selected_file_index");
    const current_index = selected_index != null ? selected_index : -1;
    this.setState({ selected_file_index: current_index + 1 });
  }

  // Decreases the selected file index by 1.
  // Guaranteed to never set below 0.
  // Does nothing when selected_file_index is undefined
  decrement_selected_file_index(): void {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const current_index = store.get("selected_file_index");
    if (current_index != null && current_index > 0) {
      this.setState({ selected_file_index: current_index - 1 });
    }
  }

  zero_selected_file_index(): void {
    this.setState({ selected_file_index: 0 });
  }

  clear_selected_file_index(): void {
    this.setState({ selected_file_index: undefined });
  }

  // Set the most recently clicked checkbox, expects a full/path/name
  set_most_recent_file_click(file): void {
    this.setState({ most_recent_file_click: file });
  }

  // Set the selected state of all files between the most_recent_file_click and the given file
  set_selected_file_range(file: string, checked: boolean): void {
    let range;
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const most_recent = store.get("most_recent_file_click");
    if (most_recent == null) {
      // nothing had been clicked before, treat as normal click
      range = [file];
    } else {
      // get the range of files
      const current_path = store.get("current_path");
      const names = store
        .get("displayed_listing")
        .listing.map((a) => misc.path_to_file(current_path, a.name));
      range = misc.get_array_range(names, most_recent, file);
    }

    if (checked) {
      this.set_file_list_checked(range);
    } else {
      this.set_file_list_unchecked(range);
    }
  }

  // set the given file to the given checked state
  set_file_checked(file: string, checked: boolean) {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const changes: {
      checked_files?: Set<string>;
      file_action?: string | undefined;
    } = {};
    if (checked) {
      changes.checked_files = store.get("checked_files").add(file);
      const file_action = store.get("file_action");
      if (
        file_action != null &&
        changes.checked_files.size > 1 &&
        !FILE_ACTIONS[file_action].allows_multiple_files
      ) {
        changes.file_action = undefined;
      }
    } else {
      changes.checked_files = store.get("checked_files").delete(file);
      if (changes.checked_files.size === 0) {
        changes.file_action = undefined;
      }
    }

    this.setState(changes);
  }

  // check all files in the given file_list
  set_file_list_checked(file_list: List<string> | string[]): void {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const changes: {
      checked_files: Set<string>;
      file_action?: string | undefined;
    } = { checked_files: store.get("checked_files").union(file_list) };
    const file_action = store.get("file_action");
    if (
      file_action != undefined &&
      changes.checked_files.size > 1 &&
      !FILE_ACTIONS[file_action].allows_multiple_files
    ) {
      changes.file_action = undefined;
    }

    this.setState(changes);
  }

  // uncheck all files in the given file_list
  set_file_list_unchecked(file_list: List<string>): void {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const changes: {
      checked_files: Set<string>;
      file_action?: string | undefined;
    } = { checked_files: store.get("checked_files").subtract(file_list) };

    if (changes.checked_files.size === 0) {
      changes.file_action = undefined;
    }

    this.setState(changes);
  }

  // uncheck all files
  set_all_files_unchecked(): void {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    this.setState({
      checked_files: store.get("checked_files").clear(),
      file_action: undefined,
    });
  }

  // this isn't really an action, but very helpful!
  public get_filenames_in_current_dir():
    | { [name: string]: boolean }
    | undefined {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }

    const files_in_dir = {};
    // This will set files_in_dir to our current view of the files in the current
    // directory (at least the visible ones) or do nothing in case we don't know
    // anything about files (highly unlikely).  Unfortunately (for this), our
    // directory listings are stored as (immutable) lists, so we have to make
    // a map out of them.
    const listing =
      store.get("directory_listings") != null
        ? store.get("directory_listings").get(store.get("current_path"))
        : undefined;
    if (typeof listing === "string") {
      // must be an error
      return undefined; // simple fallback
    }
    if (listing != null) {
      listing.map(function (x) {
        files_in_dir[x.get("name")] = true;
      });
    }
    return files_in_dir;
  }

  private _suggest_duplicate_filename(name: string): string | undefined {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }

    // fallback to name, simple fallback
    const files_in_dir = this.get_filenames_in_current_dir() || name;
    // This loop will keep trying new names until one isn't in the directory
    while (true) {
      name = misc.suggest_duplicate_filename(name);
      if (!files_in_dir[name]) {
        return name;
      }
    }
  }

  set_file_action(action?: string, get_basename?: () => string): void {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    let basename: string = "";

    switch (action) {
      case "duplicate":
        if (get_basename != undefined) {
          basename = get_basename();
        }
        this.setState({
          new_name: this._suggest_duplicate_filename(basename),
        });
        break;
      case "rename":
        if (get_basename != undefined) {
          basename = get_basename();
        }
        this.setState({ new_name: misc.path_split(basename).tail });
        break;
    }
    this.setState({ file_action: action });
  }

  show_file_action_panel(opts): void {
    opts = defaults(opts, {
      path: required,
      action: required,
    });
    const path_splitted = misc.path_split(opts.path);
    this.open_directory(path_splitted.head);
    this.set_all_files_unchecked();
    this.set_file_checked(opts.path, true);
    this.set_file_action(opts.action, () => path_splitted.tail);
  }

  private async get_from_web(opts: {
    url: string;
    dest?: string;
    timeout: number;
    alert?: boolean;
  }): Promise<void> {
    opts = defaults(opts, {
      url: required,
      dest: undefined,
      timeout: 45,
      alert: true,
    });

    const { command, args } = transform_get_url(opts.url);

    try {
      await webapp_client.project_client.exec({
        project_id: this.project_id,
        command,
        timeout: opts.timeout,
        path: opts.dest,
        args,
      });
    } catch (err) {
      alert_message({ type: "error", message: err, timeout: 15 });
    }
  }

  // function used internally by things that call webapp_client.project_client.exec
  private _finish_exec(id, cb?) {
    // returns a function that takes the err and output and
    // does the right activity logging stuff.
    return (err, output) => {
      this.fetch_directory_listing();
      if (err) {
        this.set_activity({ id, error: err });
      } else if (
        (output != null ? output.event : undefined) === "error" ||
        (output != null ? output.error : undefined)
      ) {
        this.set_activity({ id, error: output.error });
      }
      this.set_activity({ id, stop: "" });
      if (cb != null) {
        cb(err);
      }
    };
  }

  zip_files(opts) {
    let id;
    opts = defaults(opts, {
      src: required,
      dest: required,
      zip_args: undefined,
      path: undefined, // default to root of project
      id: undefined,
      cb: undefined,
    });
    const args = (opts.zip_args != null ? opts.zip_args : []).concat(
      ["-rq"],
      [opts.dest],
      opts.src
    );
    if (opts.cb == null) {
      id = opts.id != null ? opts.id : misc.uuid();
      this.set_activity({
        id,
        status: `Creating ${opts.dest} from ${opts.src.length} ${misc.plural(
          opts.src.length,
          "file"
        )}`,
      });
    }
    this.log({ event: "file_action", action: "created", files: [opts.dest] });
    webapp_client.exec({
      project_id: this.project_id,
      command: "zip",
      args,
      timeout: 10 * 60 /* compressing CAN take a while -- zip is slow! */,
      err_on_exit: true, // this should fail if exit_code != 0
      path: opts.path,
      cb: opts.cb != null ? opts.cb : this._finish_exec(id),
    });
  }

  // DANGER: ASSUMES PATH IS IN THE DISPLAYED LISTING
  private _convert_to_displayed_path(path): string {
    if (path.slice(-1) === "/") {
      return path;
    } else {
      const store = this.get_store();
      const file_name = misc.path_split(path).tail;
      if (store !== undefined && store.get("displayed_listing")) {
        const file_data = store.get("displayed_listing").file_map[file_name];
        if (file_data !== undefined && file_data.isdir) {
          return path + "/";
        }
      }
      return path;
    }
  }

  // this is called in "projects.cjsx" (more then once)
  // in turn, it is calling init methods just once, though
  init(): void {
    if (this._init_done) {
      // console.warn("ProjectActions::init called more than once");
      return;
    }
    this._init_done = true;
    // initialize project configuration data
    this.init_configuration();
    this.init_runstate_watcher();
    // init the library after project started.
    this.init_library();
    this.init_library_index();
  }

  // listen on certain runstate events and trigger associated actions
  // this method should only be called once
  private init_runstate_watcher(): void {
    const store = this.get_store();
    if (store == null) return;

    store.on("started", () => {
      this.reload_configuration();
    });

    store.on("stopped", () => {
      this.clear_configuration();
    });
  }

  // invalidates configuration cache
  private clear_configuration(): void {
    this.setState({
      configuration: undefined,
      available_features: undefined,
    });
  }

  reload_configuration(): void {
    this.init_configuration("main", true);
  }

  // retrieve project configuration (capabilities, etc.) from the back-end
  // also return it as a convenience
  async init_configuration(
    aspect: ConfigurationAspect = "main",
    no_cache = false
  ): Promise<Configuration | void> {
    this.setState({ configuration_loading: true });

    const store = this.get_store();
    if (store == null) {
      // console.warn("project_actions::init_configuration: no store");
      this.setState({ configuration_loading: false });
      return;
    }

    const prev = store.get("configuration") as ProjectConfiguration;
    if (!no_cache) {
      // already done before?
      if (prev != null) {
        const conf = prev.get(aspect) as Configuration;
        if (conf != null) {
          this.setState({ configuration_loading: false });
          return conf;
        }
      }
    }

    // we do not know the configuration aspect. "next" will be the updated datastructure.
    let next;

    await retry_until_success({
      f: async () => {
        try {
          next = await get_configuration(
            webapp_client,
            this.project_id,
            aspect,
            prev,
            no_cache
          );
        } catch (e) {
          // not implemented error happens, when the project is still the old one
          // in that case, do as if everything is available
          if (e.message.indexOf("not implemented") >= 0) {
            return null;
          }
          // console.log("project_actions::init_configuration err:", e);
          throw e;
        }
      },
      start_delay: 1000,
      max_delay: 5000,
      desc: "project_actions::init_configuration",
    });

    // there was a problem or configuration is not known
    if (next == null) {
      this.setState({ configuration_loading: false });
      return;
    }

    this.setState(
      fromJS({
        configuration: next,
        available_features: feature_is_available(next),
        configuration_loading: false,
      })
    );

    return next.get(aspect) as Configuration;
  }

  // this is called once by the project initialization
  private async init_library() {
    const conf = await this.init_configuration("main");
    if (conf != null && conf.capabilities.library === false) return;

    //if DEBUG then console.log("init_library")
    // Deprecated: this only tests the existence
    const check = (v, k, cb) => {
      //if DEBUG then console.log("init_library.check", v, k)
      const store = this.get_store();
      if (store == undefined) {
        cb("no store");
        return;
      }
      if (store.get("library")?.get(k) != null) {
        cb("already done");
        return;
      }
      const { src } = v;
      const cmd = `test -e ${src}`;
      webapp_client.exec({
        project_id: this.project_id,
        command: cmd,
        bash: true,
        timeout: 30,
        err_on_exit: false,
        path: ".",
        cb: (err, output) => {
          if (!err) {
            const store = this.get_store();
            if (store == undefined) {
              cb("no store");
              return;
            }
            let library = store.get("library");
            if (library != null) {
              library = library.set(k, output.exit_code === 0);
              this.setState({ library });
            }
          }
          return cb(err);
        },
      });
    };

    async.series([(cb) => async.eachOfSeries(LIBRARY, check, cb)]);
  }

  private async init_library_index() {
    const conf = await this.init_configuration("main");
    if (conf != null && conf.capabilities.library === false) return;

    let library, store: ProjectStore | undefined;
    if (_init_library_index_cache[this.project_id] != null) {
      const data = _init_library_index_cache[this.project_id];
      store = this.get_store();
      if (store == undefined) {
        return;
      }
      library = store.get("library")?.set("examples", data);
      this.setState({ library });
      return;
    }

    if (_init_library_index_ongoing[this.project_id]) {
      return;
    }
    _init_library_index_ongoing[this.project_id] = true;

    const index_json_url = webapp_client.project_client.read_file({
      project_id: this.project_id,
      path: LIBRARY_INDEX_FILE,
    });

    const fetch = (cb) => {
      const store = this.get_store();
      if (store == undefined) {
        cb("no store");
        return;
      }
      $.ajax({
        url: index_json_url,
        timeout: 5000,
        success: (data) => {
          //if DEBUG then console.log("init_library/datadata
          data = fromJS(data);

          const store = this.get_store();
          if (store == undefined) {
            cb("no store");
            return;
          }
          library = store.get("library")?.set("examples", data);
          this.setState({ library });
          _init_library_index_cache[this.project_id] = data;
          cb();
        },
      }).fail((err) =>
        //#if DEBUG then console.log("init_library/index: error reading file: #{misc.to_json(err)}")
        cb(err.statusText != null ? err.statusText : "error")
      );
    };

    misc.retry_until_success({
      f: fetch,
      start_delay: 1000,
      max_delay: 10000,
      max_time: 1000 * 60 * 3, // try for at most 3 minutes
      cb: () => {
        _init_library_index_ongoing[this.project_id] = false;
      },
    });
  }

  copy_from_library(opts) {
    let lib;
    opts = defaults(opts, {
      entry: undefined,
      src: undefined,
      target: undefined,
      start: undefined,
      docid: undefined, // for the log
      title: undefined, // for the log
      cb: undefined,
    });

    if (opts.entry != null) {
      lib = LIBRARY[opts.entry];
      if (lib == null) {
        this.setState({ error: `Library entry '${opts.entry}' unknown` });
        return;
      }
    }

    const id = opts.id != null ? opts.id : misc.uuid();
    this.set_activity({ id, status: "Copying files from library ..." });

    // the rsync command purposely does not preserve the timestamps,
    // such that they look like "new files" and listed on top under default sorting
    const source = join(opts.src != null ? opts.src : lib.src, "/");
    const target = join(opts.target != null ? opts.target : opts.entry, "/");
    const start =
      opts.start != null ? opts.start : lib != null ? lib.start : undefined;

    webapp_client.exec({
      project_id: this.project_id,
      command: "rsync",
      args: ["-rlDx", source, target],
      timeout: 120, // how long rsync runs on client
      err_on_exit: true,
      path: ".",
      cb: (err, output) => {
        this._finish_exec(id)(err, output);
        if (!err && start != null) {
          const open_path = join(target, start);
          if (open_path[open_path.length - 1] === "/") {
            this.open_directory(open_path);
          } else {
            this.open_file({ path: open_path });
          }
          this.log({
            event: "library",
            action: "copy",
            docid: opts.docid,
            source: opts.src,
            title: opts.title,
            target,
          });
        }
        return typeof opts.cb === "function" ? opts.cb(err) : undefined;
      },
    });
  }

  set_library_is_copying(status: boolean): void {
    this.setState({ library_is_copying: status });
  }

  copy_paths(opts) {
    opts = defaults(opts, {
      src: required, // Should be an array of source paths
      dest: required,
      id: undefined,
      only_contents: false,
    }); // true for duplicating files

    const with_slashes = opts.src.map(this._convert_to_displayed_path);

    this.log({
      event: "file_action",
      action: "copied",
      files: with_slashes.slice(0, 3),
      count: opts.src.length > 3 ? opts.src.length : undefined,
      dest: opts.dest + (opts.only_contents ? "" : "/"),
    });

    if (opts.only_contents) {
      opts.src = with_slashes;
    }

    // If files start with a -, make them interpretable by rsync (see https://github.com/sagemathinc/cocalc/issues/516)
    // Just prefix all of them, due to https://github.com/sagemathinc/cocalc/issues/4428 brining up yet another issue
    const add_leading_dash = function (src_path: string) {
      return `./${src_path}`;
    };

    // Ensure that src files are not interpreted as an option to rsync
    opts.src = opts.src.map(add_leading_dash);

    const id = opts.id != null ? opts.id : misc.uuid();
    this.set_activity({
      id,
      status: `Copying ${opts.src.length} ${misc.plural(
        opts.src.length,
        "file"
      )} to ${opts.dest}`,
    });

    let args = ["-rltgoDxH"];

    // We ensure the target copy is writable if *any* source path starts is inside of .snapshots.
    // See https://github.com/sagemathinc/cocalc/issues/2497 and https://github.com/sagemathinc/cocalc/issues/4935
    for (const x of opts.src) {
      if (in_snapshot_path(x)) {
        args = args.concat(["--perms", "--chmod", "u+w"]);
        break;
      }
    }

    args = args.concat(opts.src);
    args = args.concat([add_leading_dash(opts.dest)]);

    webapp_client.exec({
      project_id: this.project_id,
      command: "rsync", // don't use "a" option to rsync, since on snapshots results in destroying project access!
      args,
      timeout: 120, // how long rsync runs on client
      err_on_exit: true,
      path: ".",
      cb: this._finish_exec(id),
    });
  }

  copy_paths_between_projects(opts) {
    opts = defaults(opts, {
      public: false,
      src_project_id: required, // id of source project
      src: required, // list of relative paths of directories or files in the source project
      target_project_id: required, // id of target project
      target_path: undefined, // defaults to src_path
      overwrite_newer: false, // overwrite newer versions of file at destination (destructive)
      delete_missing: false, // delete files in dest that are missing from source (destructive)
      backup: false, // make ~ backup files instead of overwriting changed files
    });
    const id = misc.uuid();
    this.set_activity({
      id,
      status: `Copying ${opts.src.length} ${misc.plural(
        opts.src.length,
        "path"
      )} to a project`,
    });
    const { src } = opts;
    delete opts.src;
    const with_slashes = src.map(this._convert_to_displayed_path);
    let dest: string | undefined = undefined;
    if (opts.target_path != null) {
      dest = opts.target_path;
      if (!misc.endswith(dest, "/")) {
        dest += "/";
      }
    }
    this.log({
      event: "file_action",
      action: "copied",
      dest,
      files: with_slashes.slice(0, 3),
      count: src.length > 3 ? src.length : undefined,
      project: opts.target_project_id,
    });
    const f = async (src_path, cb) => {
      const opts0 = misc.copy(opts);
      delete opts0.cb;
      opts0.src_path = src_path;
      // we do this for consistent semantics with file copy
      opts0.target_path = misc.path_to_file(
        opts0.target_path,
        misc.path_split(src_path).tail
      );
      opts0.timeout = 90;
      try {
        await webapp_client.project_client.copy_path_between_projects(opts0);
        cb();
      } catch (err) {
        cb(err);
      }
    };
    async.mapLimit(src, 3, f, this._finish_exec(id, opts.cb));
  }

  public async rename_file(opts: { src: string; dest: string }): Promise<void> {
    const id = misc.uuid();
    const status = `Renaming ${opts.src} to ${opts.dest}`;
    let error: any = undefined;
    if (
      !(await ensure_project_running(this.project_id, `rename ${opts.src}`))
    ) {
      return;
    }

    this.set_activity({ id, status });
    try {
      const api = await this.api();
      await api.rename_file(opts.src, opts.dest);
      this.log({
        event: "file_action",
        action: "renamed",
        src: opts.src,
        dest: opts.dest + ((await this.isdir(opts.dest)) ? "/" : ""),
      });
    } catch (err) {
      error = err;
    } finally {
      this.set_activity({ id, stop: "", error });
    }
  }

  // return true if exists and is a directory
  private async isdir(path: string): Promise<boolean> {
    if (path == "") return true; // easy special case
    try {
      await webapp_client.project_client.exec({
        project_id: this.project_id,
        command: "test",
        args: ["-d", path],
        err_on_exit: true,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  public async move_files(opts: {
    src: string[];
    dest: string;
  }): Promise<void> {
    if (
      !(await ensure_project_running(
        this.project_id,
        `move ${opts.src.join(", ")}`
      ))
    ) {
      return;
    }
    const id = misc.uuid();
    const status = `Moving ${opts.src.length} ${misc.plural(
      opts.src.length,
      "file"
    )} to ${opts.dest}`;
    this.set_activity({ id, status });
    let error: any = undefined;
    try {
      const api = await this.api();
      await api.move_files(opts.src, opts.dest);
      this.log({
        event: "file_action",
        action: "moved",
        files: opts.src,
        dest: opts.dest + "/" /* target is assumed to be a directory */,
      });
    } catch (err) {
      error = err;
    } finally {
      this.set_activity({ id, stop: "", error });
    }
  }

  public async delete_files(opts: { paths: string[] }): Promise<void> {
    let mesg;
    opts = defaults(opts, { paths: required });
    if (opts.paths.length === 0) {
      return;
    }

    if (
      !(await ensure_project_running(
        this.project_id,
        `delete ${opts.paths.join(", ")}`
      ))
    ) {
      return;
    }

    const id = misc.uuid();
    if (isEqual(opts.paths, [".trash"])) {
      mesg = "the trash";
    } else if (opts.paths.length === 1) {
      mesg = `${opts.paths[0]}`;
    } else {
      mesg = `${opts.paths.length} files`;
    }
    this.set_activity({ id, status: `Deleting ${mesg}...` });
    try {
      await delete_files(this.project_id, opts.paths);
      this.log({ event: "file_action", action: "deleted", files: opts.paths });
      this.set_activity({
        id,
        status: `Successfully deleted ${mesg}.`,
        stop: "",
      });
    } catch (err) {
      this.set_activity({
        id,
        error: `Error deleting ${mesg} -- ${err}`,
        stop: "",
      });
    }
  }

  public async download_file(opts): Promise<void> {
    let url;
    opts = defaults(opts, {
      path: required,
      log: false,
      auto: true,
      print: false,
      timeout: 45,
    } as { path: string; log: boolean | string[]; auto: boolean; print: boolean; timeout: number });

    if (
      !(await ensure_project_running(
        this.project_id,
        `download the file '${opts.name}'`
      ))
    ) {
      return;
    }

    // log could also be an array of strings to record all the files that were downloaded in a zip file
    if (opts.log) {
      const files = Array.isArray(opts.log) ? opts.log : [opts.path];
      this.log({
        event: "file_action",
        action: "downloaded",
        files,
      });
    }

    if (opts.auto && !opts.print) {
      url = download_href(this.project_id, opts.path);
      download_file(url);
    } else {
      url = url_href(this.project_id, opts.path);
      const tab = open_new_tab(url);
      if (tab != null && opts.print) {
        // "?" since there might be no print method -- could depend on browser API
        tab.print?.();
      }
    }
  }

  print_file(opts): void {
    opts.print = true;
    this.download_file(opts);
  }

  show_upload(show): void {
    this.setState({ show_upload: show });
  }

  // Compute the absolute path to the file with given name but with the
  // given extension added to the file (e.g., "md") if the file doesn't have
  // that extension.  Throws an Error if the path name is invalid.
  private _absolute_path(name, current_path, ext?) {
    if (name.length === 0) {
      throw Error("Cannot use empty filename");
    }
    for (const bad_char of BAD_FILENAME_CHARACTERS) {
      if (name.indexOf(bad_char) !== -1) {
        throw Error(`Cannot use '${bad_char}' in a filename`);
      }
    }
    let s = misc.path_to_file(current_path, name);
    if (ext != null && misc.filename_extension(s) !== ext) {
      s = `${s}.${ext}`;
    }
    return s;
  }

  async create_folder(opts: {
    name: string;
    current_path?: string;
    switch_over?: boolean;
  }): Promise<void> {
    let p;
    opts = defaults(opts, {
      name: required,
      current_path: undefined,
      switch_over: true, // Whether or not to switch to the new folder
    });
    if (
      !(await ensure_project_running(
        this.project_id,
        `create the folder '${opts.name}'`
      ))
    ) {
      return;
    }
    let { name, current_path, switch_over } = opts;
    this.setState({ file_creation_error: undefined });
    if (name[name.length - 1] === "/") {
      name = name.slice(0, -1);
    }
    try {
      p = this._absolute_path(name, current_path);
    } catch (e) {
      this.setState({ file_creation_error: e.message });
      return;
    }
    try {
      await this.ensure_directory_exists(p);
    } catch (err) {
      this.setState({
        file_creation_error: `Error creating directory '${p}' -- ${err}`,
      });
      return;
    }
    this.fetch_directory_listing({ path: p });
    if (switch_over) {
      this.open_directory(p);
    }
    // Log directory creation to the event log.  / at end of path says it is a directory.
    this.log({ event: "file_action", action: "created", files: [p + "/"] });
  }

  async create_file(opts) {
    let p;
    opts = defaults(opts, {
      name: undefined,
      ext: undefined,
      current_path: undefined,
      switch_over: true, // Whether or not to switch to the new file
    });

    this.setState({ file_creation_error: undefined }); // clear any create file display state
    let { name } = opts;
    if ((name === ".." || name === ".") && opts.ext == null) {
      this.setState({
        file_creation_error: "Cannot create a file named . or ..",
      });
      return;
    }
    if (misc.is_only_downloadable(name)) {
      this.new_file_from_web(name, opts.current_path);
      return;
    }
    if (name[name.length - 1] === "/") {
      if (opts.ext == null) {
        this.create_folder({
          name,
          current_path: opts.current_path,
        });
        return;
      } else {
        name = name.slice(0, name.length - 1);
      }
    }
    try {
      p = this._absolute_path(name, opts.current_path, opts.ext);
    } catch (e) {
      console.warn("Absolute path creation error");
      this.setState({ file_creation_error: e.message });
      return;
    }
    if (
      !(await ensure_project_running(this.project_id, `create the file '${p}'`))
    ) {
      return;
    }
    const ext = misc.filename_extension(p);
    if (BANNED_FILE_TYPES.indexOf(ext) != -1) {
      this.setState({
        file_creation_error: `Cannot create a file with the ${ext} extension`,
      });
      return;
    }
    if (ext === "tex") {
      const filename = misc.path_split(name).tail;
      for (const bad_char of BAD_LATEX_FILENAME_CHARACTERS) {
        if (filename.indexOf(bad_char) !== -1) {
          this.setState({
            file_creation_error: `Cannot use '${bad_char}' in a LaTeX filename '${filename}'`,
          });
          return;
        }
      }
    }
    await webapp_client.exec({
      project_id: this.project_id,
      command: "cc-new-file",
      timeout: 10,
      args: [p],
      err_on_exit: true,
      cb: (err, output) => {
        if (!err) {
          this.log({ event: "file_action", action: "created", files: [p] });
        }
        if (err) {
          let stdout = "";
          let stderr = "";
          if (output) {
            stdout = output.stdout || "";
            stderr = output.stderr || "";
          }
          this.setState({
            file_creation_error: `${stdout} ${stderr} ${err}`,
          });
        } else if (opts.switch_over) {
          this.open_file({
            path: p,
          });
        } else {
          this.fetch_directory_listing();
        }
      },
    });
  }

  private async new_file_from_web(
    url: string,
    current_path: string
  ): Promise<void> {
    let d = current_path;
    if (d === "") {
      d = "root directory of project";
    }
    const id = misc.uuid();
    this.setState({ downloading_file: true });
    this.set_activity({
      id,
      status: `Downloading '${url}' to '${d}', which may run for up to ${FROM_WEB_TIMEOUT_S} seconds...`,
    });
    try {
      await this.get_from_web({
        url,
        dest: current_path,
        timeout: FROM_WEB_TIMEOUT_S,
        alert: true,
      });
    } finally {
      this.fetch_directory_listing();
      this.set_activity({ id, stop: "" });
      this.setState({ downloading_file: false });
      this.set_active_tab("files", { update_file_listing: false });
    }
  }

  /*
   * Actions for PUBLIC PATHS
   */
  public async set_public_path(
    path,
    opts: {
      description?: string;
      unlisted?: boolean;
      license?: string;
      disabled?: boolean;
      authenticated?: boolean;
    }
  ) {
    const store = this.get_store();
    if (!store) {
      return;
    }

    const project_id = this.project_id;
    const id = client_db.sha1(project_id, path);

    const projects_store = redux.getStore("projects");
    const compute_image =
      projects_store.getIn(["project_map", project_id, "compute_image"]) ??
      DEFAULT_COMPUTE_IMAGE;

    const table = this.redux.getProjectTable(project_id, "public_paths");
    let obj: undefined | Map<string, any> = table._table.get(id);

    let log: boolean = false;
    const now = misc.server_time();
    if (obj == null) {
      log = true;
      obj = fromJS({
        project_id,
        path,
        created: now,
        compute_image,
      });
    }
    if (obj == null) return; // make typescript happy

    // not allowed to write these back
    obj = obj.delete("last_saved");
    obj = obj.delete("counter");

    obj = obj.set("last_edited", now);
    obj = obj.set("compute_image", compute_image);

    for (const k in opts) {
      if (opts[k] != null) {
        const will_change = opts[k] != obj.get(k);
        if (!log) {
          if (k === "disabled" && will_change) {
            // changing disabled state
            log = true;
          } else if (k === "unlisted" && will_change) {
            // changing unlisted state
            log = true;
          } else if (k === "authenticated" && will_change) {
            log = true;
          }
        }
        obj = obj.set(k, opts[k]);
      }
    }
    table.set(obj);

    if (log) {
      this.log({
        event: "public_path",
        path: path + ((await this.isdir(path)) ? "/" : ""),
        disabled: !!obj.get("disabled"),
        unlisted: !!obj.get("unlisted"),
        authenticated: !!obj.get("authenticated"),
      });
    }
  }

  // Make a database query to set the name of a
  // public path.  Because this can error due to
  // an invalid name it's good to do this rather than
  // changing the public_paths table.  This function
  // will throw an exception if anything goes wrong setting
  // the name.
  public async setPublicPathName(path: string, name: string): Promise<void> {
    const id = client_db.sha1(this.project_id, path);
    const query = {
      public_paths: { project_id: this.project_id, path, name, id },
    };
    await webapp_client.async_query({ query });
  }

  /*
   * Actions for Project Search
   */

  toggle_search_checkbox_subdirectories() {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const subdirectories = !store.get("subdirectories");
    this.setState({ subdirectories });
    redux
      .getActions("account")
      ?.set_other_settings("find_subdirectories", subdirectories);
  }

  toggle_search_checkbox_case_sensitive() {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const case_sensitive = !store.get("case_sensitive");
    this.setState({ case_sensitive });
    redux
      .getActions("account")
      ?.set_other_settings("find_case_sensitive", case_sensitive);
  }

  toggle_search_checkbox_hidden_files() {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const hidden_files = !store.get("hidden_files");
    this.setState({ hidden_files });
    redux
      .getActions("account")
      ?.set_other_settings("find_hidden_files", hidden_files);
  }

  toggle_search_checkbox_git_grep() {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const git_grep = !store.get("git_grep");
    this.setState({ git_grep });
    redux.getActions("account")?.set_other_settings("find_git_grep", git_grep);
  }

  process_search_results(err, output, max_results, max_output, cmd) {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    if (err) {
      err = misc.to_user_string(err);
    }
    if ((err && output == null) || (output != null && output.stdout == null)) {
      this.setState({ search_error: err });
      return;
    }

    const results = output.stdout.split("\n");
    const too_many_results = !!(
      output.stdout.length >= max_output ||
      results.length > max_results ||
      err
    );
    let num_results = 0;
    const search_results: {}[] = [];
    for (const line of results) {
      if (line.trim() === "") {
        continue;
      }
      let i = line.indexOf(":");
      num_results += 1;
      if (i !== -1) {
        // all valid lines have a ':', the last line may have been truncated too early
        let filename = line.slice(0, i);
        if (filename.slice(0, 2) === "./") {
          filename = filename.slice(2);
        }
        let context = line.slice(i + 1);
        // strip codes in worksheet output
        if (context.length > 0 && context[0] === MARKERS.output) {
          i = context.slice(1).indexOf(MARKERS.output);
          context = context.slice(i + 2, context.length - 1);
        }

        const m = /^(\d+):/.exec(context);
        let line_number: number | undefined;
        if (m != null) {
          try {
            line_number = parseInt(m[1]);
          } catch (e) {}
        }

        search_results.push({
          filename,
          description: context,
          line_number,
        });
      }
      if (num_results >= max_results) {
        break;
      }
    }

    if (store.get("command") === cmd) {
      // only update the state if the results are from the most recent command
      this.setState({
        too_many_results,
        search_results,
      });
    }
  }

  search() {
    let cmd, ins;
    const store = this.get_store();
    if (store == undefined) {
      return;
    }

    const query = store.get("user_input").trim().replace(/"/g, '\\"');
    if (query === "") {
      return;
    }
    const search_query = `"${query}"`;

    // generate the grep command for the given query with the given flags
    if (store.get("case_sensitive")) {
      ins = "";
    } else {
      ins = " -i ";
    }

    if (store.get("git_grep")) {
      let max_depth;
      if (store.get("subdirectories")) {
        max_depth = "";
      } else {
        max_depth = "--max-depth=0";
      }
      // The || true is so that if git rev-parse has exit code 0,
      // but "git grep" finds nothing (hence has exit code 1), we don't
      // fall back to normal git (the other side of the ||). See
      //    https://github.com/sagemathinc/cocalc/issues/4276
      cmd = `git rev-parse --is-inside-work-tree && (git grep -n -I -H ${ins} ${max_depth} ${search_query} || true) || `;
    } else {
      cmd = "";
    }
    if (store.get("subdirectories")) {
      if (store.get("hidden_files")) {
        cmd += `rgrep -n -I -H --exclude-dir=.smc --exclude-dir=.snapshots ${ins} ${search_query} -- *`;
      } else {
        cmd += `rgrep -n -I -H --exclude-dir='.*' --exclude='.*' ${ins} ${search_query} -- *`;
      }
    } else {
      if (store.get("hidden_files")) {
        cmd += `grep -n -I -H ${ins} ${search_query} -- .* *`;
      } else {
        cmd += `grep -n -I -H ${ins} ${search_query} -- *`;
      }
    }

    cmd += ` | grep -v ${MARKERS.cell}`;
    const max_results = 1000;
    const max_output = 110 * max_results; // just in case

    this.setState({
      search_results: undefined,
      search_error: undefined,
      command: cmd,
      most_recent_search: query,
      most_recent_path: store.get("current_path"),
    });

    webapp_client.exec({
      project_id: this.project_id,
      command: cmd + " | cut -c 1-256", // truncate horizontal line length (imagine a binary file that is one very long line)
      timeout: 20, // how long grep runs on client
      max_output,
      bash: true,
      err_on_exit: true,
      path: store.get("current_path"),
      cb: (err, output) => {
        this.process_search_results(err, output, max_results, max_output, cmd);
      },
    });
  }

  set_file_listing_scroll(scroll_top) {
    this.setState({ file_listing_scroll_top: scroll_top });
  }

  clear_file_listing_scroll() {
    this.setState({ file_listing_scroll_top: undefined });
  }

  // Loads path in this project from string
  //  files/....
  //  new
  //  log
  //  settings
  //  search
  async load_target(
    target,
    foreground = true,
    ignore_kiosk = false,
    change_history = true,
    anchor: string = ""
  ): Promise<void> {
    const segments = target.split("/");
    const full_path = segments.slice(1).join("/");
    const parent_path = segments.slice(1, segments.length - 1).join("/");
    const last = segments.slice(-1).join();
    const main_segment = segments[0];
    switch (main_segment) {
      case "files":
        if (target[target.length - 1] === "/" || full_path === "") {
          //if DEBUG then console.log("ProjectStore::load_target → open_directory", parent_path)
          this.open_directory(parent_path, change_history);
          return;
        }
        const store = this.get_store();
        if (store == undefined) {
          return; // project closed already
        }
        let { item, err } = store.get_item_in_path(last, parent_path);
        if (item == null || err) {
          // Fetch again if error or nothing found
          try {
            await callback2(this.fetch_directory_listing, {
              path: parent_path,
            });
            const store = this.get_store();
            if (store == undefined) {
              // project closed
              return;
            }
            const x = store.get_item_in_path(last, parent_path);
            if (x.err) throw Error(x.err);
            if (x.item == null) {
              item = Map(); // creating file
            } else {
              item = x.item;
            }
          } catch (err) {
            alert_message({
              type: "error",
              message: `Error opening '${target}': ${err}`,
            });
            return;
          }
        }
        if (item.get("isdir")) {
          this.open_directory(full_path, change_history);
        } else {
          this.open_file({
            path: full_path,
            foreground,
            foreground_project: foreground,
            ignore_kiosk,
            change_history,
            anchor,
          });
        }
        break;

      case "new": // ignore foreground for these and below, since would be nonsense
        this.set_current_path(full_path);
        this.set_active_tab("new", { change_history: change_history });
        break;

      case "log":
        this.set_active_tab("log", { change_history: change_history });
        break;

      case "settings":
        this.set_active_tab("settings", { change_history: change_history });
        break;

      case "search":
        this.set_current_path(full_path);
        this.set_active_tab("search", { change_history: change_history });
        break;

      case "info":
        this.set_active_tab("info", { change_history: change_history });
        break;

      default:
        console.warn(`project/load_target: don't know segment ${main_segment}`);
    }
  }

  close_free_warning(): void {
    this.setState({ free_warning_closed: true });
  }

  async set_compute_image(compute_image: string): Promise<void> {
    await client_query({
      query: {
        projects: {
          project_id: this.project_id,
          compute_image,
        },
      },
    });
  }

  async set_environment(env: object): Promise<void> {
    if (typeof env != "object") {
      throw Error("env must be an object");
    }
    for (const key in env) {
      env[key] = `${env[key]}`;
    }
    await client_query({
      query: {
        projects: {
          project_id: this.project_id,
          env,
        },
      },
    });
  }

  project_log_load_all(): void {
    const store = this.get_store();
    if (store == null) return; // no store
    if (store.get("project_log_all") != null) return; // already done
    this.setState({ project_log: undefined });
    store.init_table("project_log_all");
    this.remove_table("project_log");
  }

  // called when project page is shown
  async show(): Promise<void> {
    const store = this.get_store();
    if (store == undefined) return; // project closed
    const a = store.get("active_project_tab");
    if (!misc.startswith(a, "editor-")) return;
    this.show_file(misc.tab_to_path(a));
  }

  // called when project page is hidden
  async hide(): Promise<void> {
    const store = this.get_store();
    if (store == undefined) return; // project closed
    const a = store.get("active_project_tab");
    if (!misc.startswith(a, "editor-")) return;
    this.hide_file(misc.tab_to_path(a));
  }

  async ensure_directory_exists(path: string): Promise<void> {
    await webapp_client.exec({
      project_id: this.project_id,
      command: "mkdir",
      args: ["-p", path],
    });
    // WARNING: If we don't do this sync, the
    // create_folder/open_directory code gets messed up
    // (with the backend watcher stuff) and the directory
    // gets stuck "Loading...".  Anyway, this is a good idea
    // to ensure the directory is fully created and usable.
    // And no, I don't like having to do this.
    await webapp_client.exec({
      project_id: this.project_id,
      command: "sync",
    });
  }

  /* NOTE!  Below we store the modal state *both* in a private
  variabel *and* in the store.  The reason is because we need
  to know it immediately after it is set in order for
  wait_until_no_modals to work robustless, and setState can
  wait before changing the state.
  */
  public clear_modal(): void {
    delete this.modal;
    this.setState({ modal: undefined });
  }

  public async show_modal({
    title,
    content,
  }: {
    title: string;
    content: string;
  }): Promise<"ok" | "cancel"> {
    if (this.modal != null) {
      await this.wait_until_no_modals();
    }
    let response: "ok" | "cancel" = "cancel";
    const modal = fromJS({
      title,
      content,
      onOk: () => (response = "ok"),
      onCancel: () => (response = "cancel"),
    });
    this.modal = modal;
    this.setState({
      modal,
    });
    await this.wait_until_no_modals();
    return response;
  }

  public async wait_until_no_modals(): Promise<void> {
    if (this.modal == null) return;
    await this.get_store()?.async_wait({
      until: (s) => !s.get("modal") && this.modal == null,
      timeout: 99999,
    });
  }

  public show_public_config(path: string): void {
    this.set_current_path(misc.path_split(path).head);
    this.set_all_files_unchecked();
    this.set_file_checked(path, true);
    this.set_file_action("share");
  }
}
