// TODO: we should refactor our code to not have these window/document/$ references here.
declare var window, document, $;

import * as async from "async";
import * as underscore from "underscore";
import * as immutable from "immutable";
import * as os_path from "path";

import { client_db } from "smc-util/schema";

const { reuseInFlight } = require("async-await-utils/hof");
import {
  ConfigurationAspect,
  Configuration,
  ProjectConfiguration,
  get_configuration,
  LIBRARY_INDEX_FILE,
  is_available as feature_is_available
} from "./project_configuration";
const { SITE_NAME } = require("smc-util/theme");
import { startswith, to_user_string } from "smc-util/misc2";
import { query as client_query } from "./frame-editors/generic/client";
import { callback, delay } from "awaiting";
import { callback2, retry_until_success } from "smc-util/async-utils";
import { exec } from "./frame-editors/generic/client";

import { editor_id, NewFilenames } from "smc-webapp/project/utils";
import { NEW_FILENAMES } from "smc-util/db-schema";

let project_file, prom_get_dir_listing_h, wrapped_editors;
if (typeof window !== "undefined" && window !== null) {
  // don't import in case not in browser (for testing)
  project_file = require("./project_file");
  wrapped_editors = require("./editor_react_wrapper");
}

// Normalize path as in node, except '' is the home dir, not '.'.
function normalize(path: string): string {
  path = os_path.normalize(path);
  if (path === ".") {
    return "";
  } else {
    return path;
  }
}

const misc = require("smc-util/misc");
let { MARKERS } = require("smc-util/sagews");
let { alert_message } = require("./alerts");
let { webapp_client } = require("./webapp_client");
let { project_tasks } = require("./project_tasks");
const { defaults, required } = misc;

import { Actions, project_redux_name, redux } from "./app-framework";

import {
  ProjectStore,
  ProjectStoreState,
  NOT_A_DIR,
  NO_DIR
} from "./project_store";

const BAD_FILENAME_CHARACTERS = "\\";
const BAD_LATEX_FILENAME_CHARACTERS = '\'"()"~%';
const BANNED_FILE_TYPES = ["doc", "docx", "pdf", "sws"];

const FROM_WEB_TIMEOUT_S = 45;

export const QUERIES = {
  project_log: {
    query: {
      id: null,
      project_id: null,
      account_id: null,
      time: null,
      event: null
    }
  },

  project_log_all: {
    query: {
      id: null,
      project_id: null,
      account_id: null,
      time: null,
      event: null
    }
  },

  public_paths: {
    query: {
      id: null,
      project_id: null,
      path: null,
      description: null,
      disabled: null,
      unlisted: null,
      created: null,
      license: null,
      last_edited: null,
      last_saved: null,
      counter: null
    }
  }
};

// src: where the library files are
// start: open this file after copying the directory
const LIBRARY = {
  first_steps: {
    src: "/ext/library/first-steps/src",
    start: "first-steps.tasks"
  }
};

const must_define = function(redux) {
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
    icon: "compress",
    allows_multiple_files: true
  },
  delete: {
    name: "Delete",
    icon: "trash-o",
    allows_multiple_files: true
  },
  rename: {
    name: "Rename",
    icon: "pencil",
    allows_multiple_files: false
  },
  duplicate: {
    name: "Duplicate",
    icon: "clone",
    allows_multiple_files: false
  },
  move: {
    name: "Move",
    icon: "arrows",
    allows_multiple_files: true
  },
  copy: {
    name: "Copy",
    icon: "files-o",
    allows_multiple_files: true
  },
  share: {
    name: "Share",
    icon: "share-square-o",
    allows_multiple_files: false
  },
  download: {
    name: "Download",
    icon: "cloud-download",
    allows_multiple_files: true
  }
};

export class ProjectActions extends Actions<ProjectStoreState> {
  public project_id: string;
  private _last_history_state: string;
  private last_close_timer: number;
  private _log_open_time: { [key: string]: { id: string; start: number } };
  private _activity_indicator_timers: { [key: string]: number };
  private _set_directory_files_lock: { [key: string]: Function[] };
  private _init_done = false;
  private new_filename_generator;

  constructor(a, b) {
    super(a, b);
    this.new_filename_generator = new NewFilenames("", false);
    this.destroy = this.destroy.bind(this);
    this._ensure_project_is_open = this._ensure_project_is_open.bind(this);
    this.get_store = this.get_store.bind(this);
    this.clear_all_activity = this.clear_all_activity.bind(this);
    this.toggle_library = this.toggle_library.bind(this);
    this.set_url_to_path = this.set_url_to_path.bind(this);
    this._url_in_project = this._url_in_project.bind(this);
    this.push_state = this.push_state.bind(this);
    this.move_file_tab = this.move_file_tab.bind(this);
    this.close_tab = this.close_tab.bind(this);
    this.set_active_tab = this.set_active_tab.bind(this);
    this.add_a_ghost_file_tab = this.add_a_ghost_file_tab.bind(this);
    this.clear_ghost_file_tabs = this.clear_ghost_file_tabs.bind(this);
    this.set_next_default_filename = this.set_next_default_filename.bind(this);
    this.set_activity = this.set_activity.bind(this);
    this.log = this.log.bind(this);
    this.log_opened_time = this.log_opened_time.bind(this);
    this.save_file = this.save_file.bind(this);
    this.save_all_files = this.save_all_files.bind(this);
    this.open_file = this.open_file.bind(this);
    this.get_scroll_saver_for = this.get_scroll_saver_for.bind(this);
    this.goto_line = this.goto_line.bind(this);
    this._set_chat_state = this._set_chat_state.bind(this);
    this.open_chat = this.open_chat.bind(this);
    this.close_chat = this.close_chat.bind(this);
    this.set_chat_width = this.set_chat_width.bind(this);
    this.flag_file_activity = this.flag_file_activity.bind(this);
    this.convert_sagenb_worksheet = this.convert_sagenb_worksheet.bind(this);
    this.convert_docx_file = this.convert_docx_file.bind(this);
    this.close_all_files = this.close_all_files.bind(this);
    this.close_file = this.close_file.bind(this);
    this.foreground_project = this.foreground_project.bind(this);
    this.open_directory = this.open_directory.bind(this);
    this.set_current_path = this.set_current_path.bind(this);
    this.set_file_search = this.set_file_search.bind(this);
    this.fetch_directory_listing = this.fetch_directory_listing.bind(this);
    this.set_sorted_file_column = this.set_sorted_file_column.bind(this);
    this.increment_selected_file_index = this.increment_selected_file_index.bind(
      this
    );
    this.decrement_selected_file_index = this.decrement_selected_file_index.bind(
      this
    );
    this.zero_selected_file_index = this.zero_selected_file_index.bind(this);
    this.clear_selected_file_index = this.clear_selected_file_index.bind(this);
    this.set_most_recent_file_click = this.set_most_recent_file_click.bind(
      this
    );
    this.set_selected_file_range = this.set_selected_file_range.bind(this);
    this.set_file_checked = this.set_file_checked.bind(this);
    this.set_file_list_checked = this.set_file_list_checked.bind(this);
    this.set_file_list_unchecked = this.set_file_list_unchecked.bind(this);
    this.set_all_files_unchecked = this.set_all_files_unchecked.bind(this);
    this._suggest_duplicate_filename = this._suggest_duplicate_filename.bind(
      this
    );
    this.set_file_action = this.set_file_action.bind(this);
    this.show_file_action_panel = this.show_file_action_panel.bind(this);
    this.get_from_web = this.get_from_web.bind(this);
    this._finish_exec = this._finish_exec.bind(this);
    this.zip_files = this.zip_files.bind(this);
    this._convert_to_displayed_path = this._convert_to_displayed_path.bind(
      this
    );
    this.init_library = this.init_library.bind(this);
    this.init_configuration = reuseInFlight(this.init_configuration.bind(this));
    this.copy_from_library = this.copy_from_library.bind(this);
    this.set_library_is_copying = this.set_library_is_copying.bind(this);
    this.copy_paths = this.copy_paths.bind(this);
    this.copy_paths_between_projects = this.copy_paths_between_projects.bind(
      this
    );
    this._move_files = this._move_files.bind(this);
    this.move_files = this.move_files.bind(this);
    this.delete_files = this.delete_files.bind(this);
    this.download_file = this.download_file.bind(this);
    this.print_file = this.print_file.bind(this);
    this.show_upload = this.show_upload.bind(this);
    this._absolute_path = this._absolute_path.bind(this);
    this.create_folder = this.create_folder.bind(this);
    this.create_file = this.create_file.bind(this);
    this.new_file_from_web = this.new_file_from_web.bind(this);
    this.set_public_path = this.set_public_path.bind(this);
    this.toggle_search_checkbox_subdirectories = this.toggle_search_checkbox_subdirectories.bind(
      this
    );
    this.toggle_search_checkbox_case_sensitive = this.toggle_search_checkbox_case_sensitive.bind(
      this
    );
    this.toggle_search_checkbox_hidden_files = this.toggle_search_checkbox_hidden_files.bind(
      this
    );
    this.toggle_search_checkbox_git_grep = this.toggle_search_checkbox_git_grep.bind(
      this
    );
    this.process_search_results = this.process_search_results.bind(this);
    this.search = this.search.bind(this);
    this.load_target = this.load_target.bind(this);
    this.show_extra_free_warning = this.show_extra_free_warning.bind(this);
    this.close_free_warning = this.close_free_warning.bind(this);
    this.ask_filename = this.ask_filename.bind(this);

    this._log_open_time = {};
    this._activity_indicator_timers = {};
  }

  destroy = (): void => {
    must_define(this.redux);
    this.close_all_files();
    for (let table in QUERIES) {
      this.remove_table(table);
    }
  };

  remove_table = (table: string): void => {
    this.redux.removeTable(project_redux_name(this.project_id, table));
  };

  // Records in the backend database that we are actively
  // using this project and wakes up the project.
  // This resets the idle timeout, among other things.
  // This is throttled, so multiple calls are spaced out.
  touch = async (): Promise<void> => {
    try {
      await callback2(webapp_client.touch_project, {
        project_id: this.project_id
      });
    } catch (err) {
      // nonfatal.
      console.warn(`unable to touch ${this.project_id} -- ${err}`);
    }
  };

  _ensure_project_is_open(cb): void {
    const s: any = this.redux.getStore("projects");
    if (!s.is_project_open(this.project_id)) {
      (this.redux.getActions("projects") as any).open_project({
        project_id: this.project_id,
        switch_to: true
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
      allow_post: true,
      timeout: 10,
      project_id: this.project_id,
      command: "rm",
      args: ["-f", sentinel],
      err_on_exit: false,
      bash: false
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
      const type = (function() {
        if (acc_store != null) {
          return acc_store.getIn(["other_settings", NEW_FILENAMES]);
        } else {
          return dflt;
        }
      })();
      this.new_filename_generator.set_ext(ext);
      this.setState({
        new_filename: this.new_filename_generator.gen(type, filenames)
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

  toggle_new(show?: boolean): void {
    this.toggle_panel("show_new", show);
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

  push_state(local_url: string): void {
    if (local_url == null) {
      local_url = this._last_history_state;
    }
    if (local_url == null) {
      local_url = `files/`;
    }
    this._last_history_state = local_url;
    const { set_url } = require("./history");
    set_url(this._url_in_project(local_url));
  }

  move_file_tab(opts): void {
    const { old_index, new_index, open_files_order } = defaults(opts, {
      old_index: required,
      new_index: required,
      open_files_order: required
    }); // immutable

    const x = open_files_order;
    const item = x.get(old_index);
    const temp_list = x.delete(old_index);
    const new_list = temp_list.splice(new_index, 0, item);
    this.setState({ open_files_order: new_list });
    (this.redux.getActions("page") as any).save_session();
  }

  // Closes a file tab
  // Also closes file references.
  // path not always defined, see #3440
  public close_tab(path: string | undefined): void {
    if (path == null) return;
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    const open_files_order = store.get("open_files_order");
    const active_project_tab = store.get("active_project_tab");
    const closed_index = open_files_order.indexOf(path);
    const { size } = open_files_order;
    if (misc.path_to_tab(path) === active_project_tab) {
      let next_active_tab;
      if (size === 1) {
        next_active_tab = "files";
      } else {
        if (closed_index === size - 1) {
          next_active_tab = misc.path_to_tab(
            open_files_order.get(closed_index - 1)
          );
        } else {
          next_active_tab = misc.path_to_tab(
            open_files_order.get(closed_index + 1)
          );
        }
      }
      this.set_active_tab(next_active_tab);
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
    opts: { update_file_listing?: boolean; change_history?: boolean } = {
      update_file_listing: true,
      change_history: true
    }
  ): void {
    let store = this.get_store();
    if (store == undefined) return; // project closed
    const prev_active_project_tab = store.get("active_project_tab");
    if (!opts.change_history && prev_active_project_tab === key) {
      // already active -- nothing further to do
      return;
    }
    if (
      prev_active_project_tab !== key &&
      startswith(prev_active_project_tab, "editor-")
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
          undefined,
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
      default:
        // editor...
        const path = misc.tab_to_path(key);
        if (this.redux.hasActions("file_use")) {
          (this.redux.getActions("file_use") as any).mark_file(
            this.project_id,
            path,
            "open"
          );
        }
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
        // the component will be rendered.
        if (info.redux_name == null || info.Editor == null) {
          const { name, Editor } = this.init_file_react_redux(path, is_public);
          info.redux_name = name;
          info.Editor = Editor;
          let open_files = store.get("open_files");
          open_files = open_files.setIn([path, "component"], info);
          change.open_files = open_files;
        }

        this.show_file(path);
    }
    this.setState(change);
  }

  add_a_ghost_file_tab(): void {
    let store = this.get_store();
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
      error: undefined
    }); // describe an error that happened
    let store = this.get_store();
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
          ).trim()
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

  // report a log event to the backend -- will indirectly result in a new entry in the store...
  // Returns the random log entry uuid. If called later with that id, then the time isn't
  // changed and the event is merely updated.
  // Returns undefined if log event is ignored
  log(event, id?: string): string | undefined {
    const my_role = (this.redux.getStore("projects") as any).get_my_group(
      this.project_id
    );
    if (["public", "admin"].indexOf(my_role) != -1) {
      // Ignore log events for *both* admin and public.
      // Admin gets to be secretive (also their account_id --> name likely wouldn't be known to users).
      // Public users don't log anything.
      return; // ignore log events
    }
    const obj: any = {
      event,
      project_id: this.project_id
    };
    if (!id) {
      // new log entry
      id = misc.uuid();
      obj.time = misc.server_time();
    }
    obj.id = id;
    require("./webapp_client").webapp_client.query({
      query: { project_log: obj },
      cb: err => {
        if (err) {
          // TODO: what do we want to do if a log doesn't get recorded?
          // (It *should* keep trying and store that in localStorage, and try next time, etc...
          //  of course done in a systematic way across everything.)
          return console.warn("error recording a log entry: ", err, event);
        }
      }
    });
    return id;
  }

  log_opened_time(path): void {
    // Call log_opened with a path to update the log with the fact that
    // this file successfully opened and rendered so that the user can
    // actually see it.  This is used to get a sense for how long things
    // are taking...
    const data =
      this._log_open_time != null ? this._log_open_time[path] : undefined;
    if (data == null) {
      // never setup log event recording the start of open (this would get set in @open_file)
      return;
    }
    const { id, start } = data;
    // do not allow recording the time more than once, which would be weird.
    delete this._log_open_time[path];
    this.log({ time: misc.server_time() - start }, id);
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
    let store = this.get_store();
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
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    store.get("open_files").forEach((val, path) => {
      const is_public = val.get("component")
        ? val.get("component").is_public
        : false; // might still in theory someday be true.
      project_file.save(path, this.redux, this.project_id, is_public);
    });
  }

  public open_in_new_browser_window(path: string): void {
    let url =
      (window.app_base_url != null ? window.app_base_url : "") +
      this._url_in_project(`files/${path}`);
    url += "?session=&fullscreen=default";
    require("./misc_page").open_popup_window(url, {
      width: 800,
      height: 640
    });
  }

  // get user's group releative to this project.
  // Can't easily use wait, since this depends on both the account
  // and project stores changing.
  // TODO: actually properly use wait somehow, since obviously it is
  // possible (just not easy).
  private async get_my_group(): Promise<string> {
    return await retry_until_success({
      f: async () => {
        let projects_store = this.redux.getStore("projects");
        if (!projects_store) {
          throw Error("projects store not defined");
        }
        const group: string | undefined = projects_store.get_my_group(
          this.project_id
        );
        if (group) {
          return group;
        } else {
          throw Error("group not yet known");
        }
      },
      max_time: 60000,
      max_delay: 3000
    });
  }

  private async open_sagenb_worksheet(opts): Promise<void> {
    // sagenb worksheet (or backup of it created during unzip of multiple worksheets with same name)
    alert_message({
      type: "info",
      message: `Opening converted CoCalc worksheet file instead of '${
        opts.path
      }...`
    });
    try {
      const path: string = await callback(
        this.convert_sagenb_worksheet,
        opts.path
      );
      await this.open_file({
        path,
        foreground: opts.foreground,
        foreground_project: opts.foreground_project,
        chat: opts.chat
      });
    } catch (err) {
      alert_message({
        type: "error",
        message: `Error converting Sage Notebook sws file -- ${err}`
      });
    }
  }

  private async open_word_document(opts): Promise<void> {
    // Microsoft Word Document
    alert_message({
      type: "info",
      message: `Opening converted plain text file instead of '${opts.path}...`
    });
    try {
      const path: string = await callback(this.convert_docx_file, opts.path);
      await this.open_file({
        path,
        foreground: opts.foreground,
        foreground_project: opts.foreground_project,
        chat: opts.chat
      });
    } catch (err) {
      alert_message({
        type: "error",
        message: `Error converting Microsoft docx file -- ${err}`
      });
    }
  }

  private log_file_open(path: string): void {
    if (this.redux.hasActions("file_use")) {
      // if the user is anonymous they don't have a file_use Actions (yet)
      (this.redux.getActions("file_use") as any).mark_file(
        this.project_id,
        path,
        "open"
      );
    }
    const event = {
      event: "open",
      action: "open",
      filename: path
    };
    const id = this.log(event);

    // Save the log entry id, so it is possible to optionally
    // record how long it took for the file to open.  This
    // may happen via a call from random places in our codebase,
    // since the idea of "finishing opening and rendering" is
    // not simple to define.
    if (id !== undefined) {
      this._log_open_time[path] = {
        id,
        start: misc.server_time()
      };
    }
  }

  private get_side_chat_state(opts: {
    path: string;
    chat?: boolean;
    chat_width?: number;
  }): void {
    // grab chat state from local storage
    const { local_storage } = require("./editor");
    if (local_storage != null) {
      if (opts.chat == null) {
        opts.chat = local_storage(this.project_id, opts.path, "is_chat_open");
      }
      if (opts.chat_width == null) {
        opts.chat_width = local_storage(
          this.project_id,
          opts.path,
          "chat_width"
        );
      }
    }

    if (misc.filename_extension(opts.path) === "sage-chat") {
      opts.chat = false;
    }
  }

  // Open the given file in this project.
  public async open_file(opts: {
    path: string;
    foreground?: boolean;
    foreground_project?: boolean;
    chat?: any;
    chat_width?: number;
    ignore_kiosk?: boolean;
    new_browser_window?: boolean;
    payload?: any;
    change_history?: boolean;
    // anchor -- if given, try to jump to scroll to this id in the editor, after it
    // renders and is put in the foreground (ignored if foreground not true)
    anchor?: string;
  }): Promise<void> {
    opts = defaults(opts, {
      path: required,
      foreground: true,
      foreground_project: true,
      chat: undefined,
      chat_width: undefined,
      ignore_kiosk: false,
      new_browser_window: false,
      payload: undefined,
      change_history: true,
      anchor: undefined
    });
    opts.path = normalize(opts.path);
    const ext = misc.filename_extension_notilde(opts.path).toLowerCase();

    // intercept any requests if in kiosk mode
    if (
      !opts.ignore_kiosk &&
      (redux.getStore("page") as any).get("fullscreen") === "kiosk"
    ) {
      alert_message({
        type: "error",
        message: `CoCalc is in Kiosk mode, so you may not open new files.  Please try visiting ${
          document.location.origin
        } directly.`,
        timeout: 15
      });
      return;
    }

    let store = this.get_store();
    if (store == undefined) return;

    const can_open_file = await store.can_open_file_ext(ext, this);
    if (!can_open_file) {
      const SiteName =
        redux.getStore("customize").get("site_name") || SITE_NAME;
      alert_message({
        type: "error",
        message: `This ${SiteName} project cannot open ${ext} files!`,
        timeout: 20
      });
      // console.log(
      //   `abort project_actions::open_file due to lack of support for "${ext}" files`
      // );
      return;
    }

    if (opts.new_browser_window) {
      // options other than path are ignored in this case.
      // TODO: do not ignore anchor option.
      this.open_in_new_browser_window(opts.path);
      return;
    }

    store = this.get_store();
    if (store == undefined) return;
    let open_files = store.get("open_files");
    if (!open_files.has(opts.path)) {
      // Make the tab appear ASAP
      open_files = open_files.setIn([opts.path, "component"], {});
      this.setState({ open_files });
    }

    // Wait for the project to start opening
    try {
      await callback(this._ensure_project_is_open);
    } catch (err) {
      this.set_activity({
        id: misc.uuid(),
        error: `Error opening file '${
          opts.path
        }' (error ensuring project is open) -- ${err}`
      });
      return;
    }
    if (this.get_store() == null) return;

    // Next get the group.
    let group: string;
    try {
      group = await this.get_my_group();
      if (this.get_store() == null) return;
    } catch (err) {
      this.set_activity({
        id: misc.uuid(),
        error: `opening file '${opts.path}' (error getting group) -- ${err}`
      });
      return;
    }

    const is_public = group === "public";

    if (!is_public && (ext === "sws" || ext.slice(0, 4) === "sws~")) {
      await this.open_sagenb_worksheet(opts);
      return;
    }

    if (!is_public && ext === "docx") {
      await this.open_word_document(opts);
      return;
    }

    if (!is_public) {
      this.log_file_open(opts.path);
      this.get_side_chat_state(opts);
    }

    store = this.get_store(); // because async stuff happened above.
    if (store == undefined) return;

    // Only generate the editor component if we don't have it already
    // Also regenerate if view type (public/not-public) changes
    const file_info = open_files.getIn([opts.path, "component"], {
      is_public: false
    });
    if (!open_files.has(opts.path) || file_info.is_public !== is_public) {
      const was_public = file_info.is_public;

      if (was_public != null && was_public !== is_public) {
        this.setState({
          open_files: open_files.delete(opts.path)
        });
        project_file.remove(opts.path, this.redux, this.project_id, was_public);
      }

      if (opts.payload) {
        let a: any = redux.getEditorActions(this.project_id, opts.path);
        if (a.dispatch_payload) {
          a.dispatch_payload(opts.payload);
        }
      }

      const open_files_order = store.get("open_files_order");

      // Add it to open files
      // IMPORTANT: info can't be a full immutable.js object, since Editor will
      // get stored in it later, and Editor can't be converted to immutable,
      // so don't try to do that!
      const info = { is_public };
      open_files = open_files.setIn([opts.path, "component"], info);
      open_files = open_files.setIn([opts.path, "is_chat_open"], opts.chat);
      open_files = open_files.setIn([opts.path, "chat_width"], opts.chat_width);
      let index: number = open_files_order.indexOf(opts.path);
      if (opts.chat) {
        require("./chat/register").init(
          misc.meta_file(opts.path, "chat"),
          this.redux,
          this.project_id
        );
      }
      // Closed by require('./project_file').remove

      if (index === -1) {
        index = open_files_order.size;
      }
      this.setState({
        open_files,
        open_files_order: open_files_order.set(index, opts.path)
      });
      (this.redux.getActions("page") as any).save_session();
    }

    if (opts.foreground) {
      this.foreground_project(opts.change_history);
      const tab = misc.path_to_tab(opts.path);
      this.set_active_tab(tab, {
        change_history: opts.change_history
      });
      if (opts.anchor) {
        // Scroll the *visibile* one into view.  NOTE: it's possible
        // that several notebooks (say) are all open in background tabs
        // and all have the same anchor tag in them; we only want to
        // try to scroll the visible one or ones.
        // We also have no reliable way to know if the editor has
        // fully loaded yet, so we just try until the tag appears
        // up to 15s.  Someday, we will have to make it so editors
        // somehow clearly indicate when they are done loading, and
        // we can use that to do this right.
        const start: number = new Date().valueOf();
        const id = editor_id(this.project_id, opts.path);
        while (new Date().valueOf() - start <= 15000) {
          await delay(100);
          let store = this.get_store();
          if (store == undefined) break;
          if (tab != store.get("active_project_tab")) break;
          let e = $("#" + id).find("#" + opts.anchor);
          if (e.length > 0) {
            // We iterate through all of them in this visible editor.
            // Because of easy editor splitting we could easily have multiple
            // copies of the same id, and we move them all into view.
            // Change this to break after the first one if this annoys people;
            // it's not clear what the "right" design is.
            for (let x of e) {
              x.scrollIntoView();
            }
            break;
          } else {
            await delay(100);
          }
        }
      }
    }
  }

  /* Initialize the redux store and react component for editing
     a particular file.
  */
  private init_file_react_redux(
    path: string,
    is_public: boolean
  ): { name: string; Editor: any } {
    // Initialize the file's store and actions
    const name = project_file.initialize(
      path,
      this.redux,
      this.project_id,
      is_public
    );

    // Make the Editor react component
    const Editor = project_file.generate(
      path,
      this.redux,
      this.project_id,
      is_public
    );

    return { name, Editor };
  }

  get_scroll_saver_for(path: string) {
    if (path != null) {
      return scroll_position => {
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
  public goto_line(path, line): void {
    const a: any = redux.getEditorActions(this.project_id, path);
    if (a == null) {
      // try non-react editor
      const editor = wrapped_editors.get_editor(this.project_id, path);
      if (
        editor != null &&
        typeof editor.programmatical_goto_line === "function"
      ) {
        editor.programmatical_goto_line(line);
      }
    } else {
      if (typeof a.programmatical_goto_line === "function") {
        a.programmatical_goto_line(line);
      }
    }
  }

  // Called when a file tab is shown.
  private show_file(path): void {
    const a: any = redux.getEditorActions(this.project_id, path);
    if (a == null) {
      // try non-react editor
      const editor = wrapped_editors.get_editor(this.project_id, path);
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
      const editor = wrapped_editors.get_editor(this.project_id, path);
      if (editor != null) editor.hide();
    } else {
      if (typeof a.hide === "function") a.hide();
    }
  }

  // Used by open/close chat below.
  _set_chat_state(path, is_chat_open): void {
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    const open_files = store.get("open_files");
    if (open_files != null && path != null) {
      this.setState({
        open_files: open_files.setIn([path, "is_chat_open"], is_chat_open)
      });
    }
  }

  // Open side chat for the given file, assuming the file is open, store is initialized, etc.
  open_chat(opts) {
    opts = defaults(opts, { path: required });
    this._set_chat_state(opts.path, true);
    require("./chat/register").init(
      misc.meta_file(opts.path, "chat"),
      this.redux,
      this.project_id
    );
    let editor = require("./editor");
    editor
      ? editor.local_storage(this.project_id, opts.path, "is_chat_open", true)
      : undefined;
  }

  // Close side chat for the given file, assuming the file itself is open
  close_chat(opts) {
    opts = defaults(opts, { path: required });
    this._set_chat_state(opts.path, false);
    let editor = require("./editor");
    editor
      ? editor.local_storage(this.project_id, opts.path, "is_chat_open", false)
      : undefined;
  }

  set_chat_width(opts): void {
    opts = defaults(opts, {
      path: required,
      width: required
    }); // between 0 and 1
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    const open_files = store.get("open_files");
    if (open_files != null) {
      const width = misc.ensure_bound(opts.width, 0.05, 0.95);
      let editor = require("./editor");
      editor
        ? editor.local_storage(this.project_id, opts.path, "chat_width", width)
        : undefined;
      this.setState({
        open_files: open_files.setIn([opts.path, "chat_width"], width)
      });
    }
  }

  // OPTIMIZATION: Some possible performance problems here. Debounce may be necessary
  flag_file_activity(filename: string): void {
    if (filename == null) {
      return;
    }

    const timer = this._activity_indicator_timers[filename];
    if (timer != null) {
      window.clearTimeout(timer);
    }

    const set_inactive = () => {
      let store = this.get_store();
      if (store == undefined) {
        return;
      }
      const current_files = store.get("open_files");
      this.setState({
        open_files: current_files.setIn([filename, "has_activity"], false)
      });
    };

    this._activity_indicator_timers[filename] = window.setTimeout(
      set_inactive,
      1000
    );

    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    const open_files = store.get("open_files");
    const new_files_data = open_files.setIn([filename, "has_activity"], true);
    this.setState({ open_files: new_files_data });
  }

  convert_sagenb_worksheet(filename, cb) {
    return async.series(
      [
        cb => {
          const ext = misc.filename_extension(filename);
          if (ext === "sws") {
            return cb();
          } else {
            const i = filename.length - ext.length;
            const new_filename =
              filename.slice(0, i - 1) + ext.slice(3) + ".sws";
            webapp_client.exec({
              project_id: this.project_id,
              command: "cp",
              args: [filename, new_filename],
              cb: err => {
                if (err) {
                  return cb(err);
                } else {
                  filename = new_filename;
                  return cb();
                }
              }
            });
          }
        },
        cb => {
          webapp_client.exec({
            project_id: this.project_id,
            command: "smc-sws2sagews",
            args: [filename],
            cb: err => {
              return cb(err);
            }
          });
        }
      ],
      err => {
        if (err) {
          return cb(err);
        } else {
          return cb(
            undefined,
            filename.slice(0, filename.length - 3) + "sagews"
          );
        }
      }
    );
  }

  convert_docx_file(filename, cb) {
    webapp_client.exec({
      project_id: this.project_id,
      command: "smc-docx2txt",
      args: [filename],
      cb: (err, output) => {
        if (err) {
          return cb(`${err}, ${misc.to_json(output)}`);
        } else {
          return cb(false, filename.slice(0, filename.length - 4) + "txt");
        }
      }
    });
  }

  // Closes all files and removes all references
  close_all_files() {
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    const file_paths = store.get("open_files");
    if (file_paths.isEmpty()) {
      return;
    }

    file_paths.map((obj, path) => {
      const component_data = obj.getIn(["component"]);
      const is_public = component_data ? component_data.is_public : undefined;
      project_file.remove(path, this.redux, this.project_id, is_public);
    });

    this.setState({
      open_files_order: immutable.List([]),
      open_files: immutable.Map({})
    });
  }

  // Closes the file and removes all references.
  // Does not update tabs
  close_file(path): void {
    path = normalize(path);
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    const x = store.get("open_files_order");
    const index = x.indexOf(path);
    if (index !== -1) {
      const open_files = store.get("open_files");
      const component_data = open_files.getIn([path, "component"]);
      const is_public = component_data ? component_data.is_public : undefined;
      this.setState({
        open_files_order: x.delete(index),
        open_files: open_files.delete(path)
      });
      project_file.remove(path, this.redux, this.project_id, is_public);
      (this.redux.getActions("page") as any).save_session();
    }
  }

  // Makes this project the active project tab
  foreground_project(change_history = true): void {
    this._ensure_project_is_open(err => {
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

  open_directory(path, change_history = true): void {
    path = normalize(path);
    this._ensure_project_is_open(err => {
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
        let store = this.get_store();
        if (store == undefined) {
          return;
        }
        this.set_active_tab("files", {
          update_file_listing: false,
          change_history: change_history
        });
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

    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    let history_path = store.get("history_path") || "";
    const is_adjacent = !`${history_path}/`.startsWith(`${path}/`);
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
      most_recent_file_click: undefined
    });

    this.fetch_directory_listing();
  }

  set_file_search(search): void {
    this.setState({
      file_search: search,
      page_number: 0,
      file_action: undefined,
      most_recent_file_click: undefined,
      create_file_alert: false
    });
  }

  // Update the directory listing cache for the given path
  // Uses current path if path not provided
  fetch_directory_listing(opts?): void {
    let status;
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    opts = defaults(opts, {
      path: store.get("current_path"),
      cb: undefined
    }); // WARNING: THINK VERY HARD BEFORE YOU USE THIS
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
    return async.series(
      [
        cb => {
          // make sure the user type is known;
          // otherwise, our relationship to project
          // below can't be determined properly.
          this.redux.getStore("account").wait({
            until: s =>
              (s.get("is_logged_in") && s.get("account_id")) ||
              !s.get("is_logged_in"),
            cb: cb
          });
        },

        cb => {
          let projects_store = this.redux.getStore("projects");
          // make sure that our relationship to this project is known.
          if (projects_store == null) {
            cb("projects_store not yet initialized");
            return;
          }
          projects_store.wait({
            until: s => (s as any).get_my_group(this.project_id),
            timeout: 30,
            cb: (err, group) => {
              my_group = group;
              cb(err);
            }
          });
        },
        cb => {
          store = this.get_store();
          if (store == null) {
            cb("store no longer defined");
            return;
          }
          if (path == null) {
            path = store.get("current_path");
          }
          get_directory_listing({
            project_id: this.project_id,
            path,
            hidden: true,
            max_time_s: 15 * 60, // keep trying for up to 15 minutes
            group: my_group,
            cb: (err, listing) => {
              the_listing = listing;
              cb(err);
            }
          });
        }
      ],
      err => {
        this.set_activity({ id, stop: "" });
        // Update the path component of the immutable directory listings map:
        store = this.get_store();
        if (store == undefined) {
          return;
        }
        if (err && !misc.is_string(err)) {
          err = misc.to_json(err);
        }
        const map = store
          .get("directory_listings")
          .set(path, err ? err : immutable.fromJS(the_listing.files));
        this.setState({ directory_listings: map });
        // done! releasing lock, then executing callback(s)
        const cbs = this._set_directory_files_lock[_key];
        delete this._set_directory_files_lock[_key];
        for (let cb of cbs != null ? cbs : []) {
          //if DEBUG then console.log('ProjectStore::fetch_directory_listing cb from lock', cb)
          if (typeof cb === "function") {
            cb();
          }
        }
        //if DEBUG then console.log('ProjectStore::fetch_directory_listing cb', opts, opts.cb)
        if (opts.cb !== undefined) {
          opts.cb();
        }
      }
    );
  }

  // Sets the active file_sort to next_column_name
  set_sorted_file_column(column_name): void {
    let is_descending;
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const current = store.get("active_file_sort");
    if ((current != null ? current.column_name : undefined) === column_name) {
      is_descending = !current.is_descending;
    } else {
      is_descending = false;
    }
    const next_file_sort = { is_descending, column_name };
    this.setState({ active_file_sort: next_file_sort });
  }

  // Increases the selected file index by 1
  // undefined increments to 0
  increment_selected_file_index(): void {
    let store = this.get_store();
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
    let store = this.get_store();
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
    let store = this.get_store();
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
        .listing.map(a => misc.path_to_file(current_path, a.name));
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
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    let changes: {
      checked_files?: immutable.Set<string>;
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
  set_file_list_checked(file_list: immutable.List<string>): void {
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    const changes: {
      checked_files: immutable.Set<string>;
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
  set_file_list_unchecked(file_list: immutable.List<string>): void {
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    const changes: {
      checked_files: immutable.Set<string>;
      file_action?: string | undefined;
    } = { checked_files: store.get("checked_files").subtract(file_list) };

    if (changes.checked_files.size === 0) {
      changes.file_action = undefined;
    }

    this.setState(changes);
  }

  // uncheck all files
  set_all_files_unchecked(): void {
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    this.setState({
      checked_files: store.get("checked_files").clear(),
      file_action: undefined
    });
  }

  // this isn't really an action, but very helpful!
  public get_filenames_in_current_dir():
    | { [name: string]: boolean }
    | undefined {
    let store = this.get_store();
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
      listing.map(function(x) {
        files_in_dir[x.get("name")] = true;
      });
    }
    return files_in_dir;
  }

  private _suggest_duplicate_filename(name: string): string | undefined {
    let store = this.get_store();
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
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    let basename: string = "";

    switch (action) {
      case "move":
        const checked_files = store.get("checked_files").toArray();
        (this.redux.getActions("projects") as any).fetch_directory_tree(
          this.project_id,
          { exclusions: checked_files }
        );
        break;
      case "copy":
        (this.redux.getActions("projects") as any).fetch_directory_tree(
          this.project_id
        );
        break;
      case "duplicate":
        if (get_basename != undefined) {
          basename = get_basename();
        }
        this.setState({
          new_name: this._suggest_duplicate_filename(basename)
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
      action: required
    });
    const path_splitted = misc.path_split(opts.path);
    this.open_directory(path_splitted.head);
    this.set_all_files_unchecked();
    this.set_file_checked(opts.path, true);
    this.set_file_action(opts.action, () => path_splitted.tail);
  }

  get_from_web(opts) {
    opts = defaults(opts, {
      url: required,
      dest: undefined,
      timeout: 45,
      alert: true,
      cb: undefined
    }); // cb(true or false, depending on error)

    const { command, args } = misc.transform_get_url(opts.url);

    return require("./webapp_client").webapp_client.exec({
      project_id: this.project_id,
      command,
      timeout: opts.timeout,
      path: opts.dest,
      args,
      cb: (err, result) => {
        if (opts.alert) {
          if (err) {
            alert_message({ type: "error", message: err });
          } else if (result.event === "error") {
            alert_message({ type: "error", message: result.error });
          }
        }
        return typeof opts.cb === "function"
          ? opts.cb(err || result.event === "error")
          : undefined;
      }
    });
  }

  // function used internally by things that call webapp_client.exec
  private _finish_exec(id) {
    // returns a function that takes the err and output and does the right activity logging stuff.
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
      cb: undefined
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
        )}`
      });
    }
    webapp_client.exec({
      project_id: this.project_id,
      command: "zip",
      args,
      timeout: 10 * 60 /* compressing CAN take a while -- zip is slow! */,
      network_timeout: 10 * 60,
      err_on_exit: true, // this should fail if exit_code != 0
      path: opts.path,
      cb: opts.cb != null ? opts.cb : this._finish_exec(id)
    });
  }

  // DANGER: ASSUMES PATH IS IN THE DISPLAYED LISTING
  private _convert_to_displayed_path(path): string {
    if (path.slice(-1) === "/") {
      return path;
    } else {
      let store = this.get_store();
      let file_name = misc.path_split(path).tail;
      if (store !== undefined && store.get("displayed_listing")) {
        let file_data = store.get("displayed_listing").file_map[file_name];
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
      this.clear_configuration();
      this.init_configuration("main");
    });

    store.on("stopped", () => {
      this.clear_configuration();
    });
  }

  // invalidates configuration cache
  private clear_configuration(): void {
    this.setState({
      configuration: undefined,
      available_features: undefined
    });
  }

  // retrieve project configuration (capabilities, etc.) from the back-end
  // also return it as a convenience
  async init_configuration(
    aspect: ConfigurationAspect = "main"
  ): Promise<Configuration | void> {
    this.setState({ configuration_loading: true });

    const store = this.get_store();
    if (store == null) {
      // console.warn("project_actions::init_configuration: no store");
      this.setState({ configuration_loading: false });
      return;
    }

    // already done before?
    const prev = store.get("configuration") as ProjectConfiguration;
    if (prev != null) {
      const conf = prev.get(aspect) as Configuration;
      if (conf != null) {
        this.setState({ configuration_loading: false });
        return conf;
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
            prev
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
      desc: "project_actions::init_configuration"
    });

    // there was a problem or configuration is not known
    if (next == null) {
      this.setState({ configuration_loading: false });
      return;
    }

    this.setState({
      configuration: next,
      available_features: feature_is_available(next),
      configuration_loading: false
    });

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
      let store = this.get_store();
      if (store == undefined) {
        cb("no store");
        return;
      }
      if (
        (store.get("library") != null
          ? store.get("library").get(k)
          : undefined) != null
      ) {
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
        network_timeout: 120,
        err_on_exit: false,
        path: ".",
        cb: (err, output) => {
          if (!err) {
            let store = this.get_store();
            if (store == undefined) {
              cb("no store");
              return;
            }
            let library = store.get("library");
            library = library.set(k, output.exit_code === 0);
            this.setState({ library });
          }
          return cb(err);
        }
      });
    };

    async.series([cb => async.eachOfSeries(LIBRARY, check, cb)]);
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
      library = store.get("library").set("examples", data);
      this.setState({ library });
      return;
    }

    if (_init_library_index_ongoing[this.project_id]) {
      return;
    }
    _init_library_index_ongoing[this.project_id] = true;

    ({ webapp_client } = require("./webapp_client"));

    const index_json_url = webapp_client.read_file_from_project({
      project_id: this.project_id,
      path: LIBRARY_INDEX_FILE
    });

    const fetch = cb => {
      let store = this.get_store();
      if (store == undefined) {
        cb("no store");
        return;
      }
      $.ajax({
        url: index_json_url,
        timeout: 5000,
        success: data => {
          //if DEBUG then console.log("init_library/datadata
          data = immutable.fromJS(data);

          let store = this.get_store();
          if (store == undefined) {
            cb("no store");
            return;
          }
          library = store.get("library").set("examples", data);
          this.setState({ library });
          _init_library_index_cache[this.project_id] = data;
          cb();
        }
      }).fail(err =>
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
      }
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
      cb: undefined
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
    const source = os_path.join(opts.src != null ? opts.src : lib.src, "/");
    const target = os_path.join(
      opts.target != null ? opts.target : opts.entry,
      "/"
    );
    const start =
      opts.start != null ? opts.start : lib != null ? lib.start : undefined;

    webapp_client.exec({
      project_id: this.project_id,
      command: "rsync",
      args: ["-rlDx", source, target],
      timeout: 120, // how long rsync runs on client
      network_timeout: 120, // how long network call has until it must return something or get total error.
      err_on_exit: true,
      path: ".",
      cb: (err, output) => {
        this._finish_exec(id)(err, output);
        if (!err && start != null) {
          const open_path = os_path.join(target, start);
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
            target
          });
        }
        return typeof opts.cb === "function" ? opts.cb(err) : undefined;
      }
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
      only_contents: false
    }); // true for duplicating files

    const with_slashes = opts.src.map(this._convert_to_displayed_path);

    this.log({
      event: "file_action",
      action: "copied",
      files: with_slashes.slice(0, 3),
      count: opts.src.length > 3 ? opts.src.length : undefined,
      dest: opts.dest + (opts.only_contents ? "" : "/")
    });

    if (opts.only_contents) {
      opts.src = with_slashes;
    }

    // If files start with a -, make them interpretable by rsync (see https://github.com/sagemathinc/cocalc/issues/516)
    const deal_with_leading_dash = function(src_path: string) {
      if (src_path[0] === "-") {
        return `./${src_path}`;
      } else {
        return src_path;
      }
    };

    // Ensure that src files are not interpreted as an option to rsync
    opts.src = opts.src.map(deal_with_leading_dash);

    const id = opts.id != null ? opts.id : misc.uuid();
    this.set_activity({
      id,
      status: `Copying ${opts.src.length} ${misc.plural(
        opts.src.length,
        "file"
      )} to ${opts.dest}`
    });

    let args = ["-rltgoDxH"];

    // We ensure the target copy is writable if *any* source path starts with .snapshots.
    // See https://github.com/sagemathinc/cocalc/issues/2497
    // This is a little lazy, but whatever.
    for (let x of opts.src) {
      if (misc.startswith(x, ".snapshots")) {
        args = args.concat(["--perms", "--chmod", "u+w"]);
        break;
      }
    }

    args = args.concat(opts.src);
    args = args.concat([opts.dest]);

    webapp_client.exec({
      project_id: this.project_id,
      command: "rsync", // don't use "a" option to rsync, since on snapshots results in destroying project access!
      args,
      timeout: 120, // how long rsync runs on client
      network_timeout: 120, // how long network call has until it must return something or get total error.
      err_on_exit: true,
      path: ".",
      cb: this._finish_exec(id)
    });
  }

  copy_paths_between_projects(opts) {
    opts = defaults(opts, {
      public: false,
      src_project_id: required, // id of source project
      src: required, // list of relative paths of directors or files in the source project
      target_project_id: required, // if of target project
      target_path: undefined, // defaults to src_path
      overwrite_newer: false, // overwrite newer versions of file at destination (destructive)
      delete_missing: false, // delete files in dest that are missing from source (destructive)
      backup: false, // make ~ backup files instead of overwriting changed files
      timeout: undefined, // how long to wait for the copy to complete before reporting "error" (though it could still succeed)
      exclude_history: false, // if true, exclude all files of the form *.sage-history
      id: undefined
    });
    // TODO: wrote this but *NOT* tested yet -- needed "copy_click".
    const id = opts.id != null ? opts.id : misc.uuid();
    this.set_activity({
      id,
      status: `Copying ${opts.src.length} ${misc.plural(
        opts.src.length,
        "path"
      )} to another project`
    });
    const { src } = opts;
    delete opts.src;
    const with_slashes = src.map(this._convert_to_displayed_path);
    this.log({
      event: "file_action",
      action: "copied",
      files: with_slashes.slice(0, 3),
      count: src.length > 3 ? src.length : undefined,
      project: opts.target_project_id
    });
    const f = (src_path, cb) => {
      const opts0 = misc.copy(opts);
      opts0.cb = cb;
      opts0.src_path = src_path;
      // we do this for consistent semantics with file copy
      opts0.target_path = misc.path_to_file(
        opts0.target_path,
        misc.path_split(src_path).tail
      );
      webapp_client.copy_path_between_projects(opts0);
    };
    return async.mapLimit(src, 3, f, this._finish_exec(id));
  }

  private _move_files(opts) {
    //PRIVATE -- used internally to move files
    opts = defaults(opts, {
      src: required,
      dest: required,
      path: undefined, // default to root of project
      mv_args: undefined,
      cb: required
    });
    if (!opts.dest && opts.path == null) {
      opts.dest = ".";
    }

    webapp_client.exec({
      project_id: this.project_id,
      command: "mv",
      args: (opts.mv_args != null ? opts.mv_args : []).concat(
        ["--"],
        opts.src,
        [opts.dest]
      ),
      timeout: 15, // move should be fast..., unless across file systems.
      network_timeout: 20,
      err_on_exit: true, // this should fail if exit_code != 0
      path: opts.path,
      cb: opts.cb
    });
  }

  move_files(opts): void {
    let path;
    opts = defaults(opts, {
      src: required, // Array of src paths to mv
      dest: required, // Single dest string
      dest_is_folder: required,
      path: undefined, // default to root of project
      mv_args: undefined,
      id: undefined,
      include_chats: false
    }); // If we want to copy .filename.sage-chat

    // TODO: Put this somewhere else!
    const get_chat_path = path => misc.meta_file(path, "chat");
    //{head, tail} = misc.path_split(path)
    //misc.normalized_path_join(head ? '', ".#{tail ? ''}.sage-chat")

    const collect_course_discussions = (array, path) => {
      if (!misc.endswith(path, ".course")) {
        return;
      }
      const head_tail = misc.path_split(path);
      let store = this.get_store();
      if (!store) {
        return;
      }
      const head = head_tail.head != null ? head_tail.head : "";
      const listing = store.get("directory_listings").get(head);
      const discussion_path_prefix = `.${head_tail.tail}-`;
      listing.map(function(entry) {
        const filename = entry.get("name");
        // both reasons must be true to pick the chat file:
        const take1 = misc.startswith(filename, discussion_path_prefix);
        const take2 = misc.endswith(filename, ".sage-chat");
        if (take1 && take2) {
          const discussion_path = os_path.join(head_tail.head, filename);
          if (!opts.src.includes(discussion_path)) {
            return array.push(discussion_path);
          }
        }
      });
      return array;
    };

    if (opts.include_chats) {
      if (opts.dest_is_folder) {
        let chat_paths: string[] = [];
        for (let path of opts.src) {
          const chat_path = get_chat_path(path);
          if (opts.src.indexOf(chat_path) == -1) {
            chat_paths.push(chat_path);
          }
          collect_course_discussions(opts.src, path);
        }
        opts.src.concat(chat_paths);
      } else {
        const old_chat_path = get_chat_path(opts.src[0]);
        const new_chat_path = get_chat_path(opts.dest);

        this.move_files({
          src: [old_chat_path],
          dest: new_chat_path,
          dest_is_folder: false
        });

        // also rename associated course discussion files
        const orig_src = opts.src[0];
        const course_discussions = collect_course_discussions([], orig_src);
        if (course_discussions.length > 0) {
          const src_head_tail = misc.path_split(orig_src);
          const dest_head_tail = misc.path_split(opts.dest);
          const course_dirs: string[] = Array.from(course_discussions);
          for (let cd of course_dirs) {
            // postfix is the remaining part of the filename itself
            const postfix = cd.slice(1 + src_head_tail.tail.length);
            const src = os_path.join(src_head_tail.head, cd);
            // construct new target filename
            const dest_tail = `.${dest_head_tail.tail}${postfix}`;
            const dest = os_path.join(dest_head_tail.head, dest_tail);
            this.move_files({
              src: [src],
              dest,
              dest_is_folder: false
            });
          }
        }
      }
    }

    delete opts.include_chats;
    delete opts.dest_is_folder;

    const check_existence_of = (path: string): boolean => {
      let store = this.get_store();
      let path_parts = misc.path_split(path);
      if (store == undefined) {
        return false;
      }
      return store
        .get("directory_listings")
        .get(path_parts.head != null ? path_parts.head : "")
        .some(item => item.get("name") === path_parts.tail);
    };

    const valid_sources: string[] = [];
    for (path of opts.src) {
      if (check_existence_of(path)) {
        valid_sources.push(path);
      }
    }
    opts.src = valid_sources;

    if (opts.src.length === 0) {
      return;
    }

    const id = opts.id != null ? opts.id : misc.uuid();
    this.set_activity({
      id,
      status: `Moving ${opts.src.length} ${misc.plural(
        opts.src.length,
        "file"
      )} to ${opts.dest}`
    });
    delete opts.id;

    opts.cb = err => {
      if (err) {
        this.set_activity({ id, error: err });
      } else {
        this.fetch_directory_listing();
      }
      this.log({
        event: "file_action",
        action: "moved",
        files: opts.src.slice(0, 3),
        count: opts.src.length > 3 ? opts.src.length : undefined,
        dest: opts.dest
      });
      this.set_activity({ id, stop: "" });
    };
    return this._move_files(opts);
  }

  delete_files(opts): void {
    let mesg;
    opts = defaults(opts, { paths: required });
    if (opts.paths.length === 0) {
      return;
    }
    for (let path of opts.paths) {
      this.close_tab(path);
    }
    const id = misc.uuid();
    if (underscore.isEqual(opts.paths, [".trash"])) {
      mesg = "the trash";
    } else if (opts.paths.length === 1) {
      mesg = `${opts.paths[0]}`;
    } else {
      mesg = `${opts.paths.length} files`;
    }
    this.set_activity({ id, status: `Deleting ${mesg}` });
    webapp_client.exec({
      project_id: this.project_id,
      command: "rm",
      timeout: 60,
      args: ["-rf", "--"].concat(opts.paths),
      cb: (err, result) => {
        this.fetch_directory_listing();
        if (err) {
          this.set_activity({
            id,
            error: `Network error while trying to delete ${mesg} -- ${err}`,
            stop: ""
          });
          return;
        } else if (result.event === "error") {
          this.set_activity({
            id,
            error: `Error deleting ${mesg} -- ${result.error}`,
            stop: ""
          });
          return;
        } else {
          this.set_activity({
            id,
            status: `Successfully deleted ${mesg}.`,
            stop: ""
          });
          return this.log({
            event: "file_action",
            action: "deleted",
            files: opts.paths.slice(0, 3),
            count: opts.paths.length > 3 ? opts.paths.length : undefined
          });
        }
      }
    });
  }

  download_file(opts): void {
    let url;
    const { download_file, open_new_tab } = require("./misc_page");
    opts = defaults(opts, {
      path: required,
      log: false,
      auto: true,
      print: false,
      timeout: 45
    });

    if (opts.log) {
      this.log({
        event: "file_action",
        action: "downloaded",
        files: opts.path
      });
    }

    if (opts.auto && !opts.print) {
      url = project_tasks(this.project_id).download_href(opts.path);
      return download_file(url);
    } else {
      url = project_tasks(this.project_id).url_href(opts.path);
      const tab = open_new_tab(url);
      if (tab != null && opts.print) {
        // "?" since there might be no print method -- could depend on browser API
        return typeof tab.print === "function" ? tab.print() : undefined;
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
    for (let bad_char of BAD_FILENAME_CHARACTERS) {
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

  create_folder(opts) {
    let p;
    opts = defaults(opts, {
      name: required,
      current_path: undefined,
      switch_over: true
    }); // Whether or not to switch to the new folder
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
    return project_tasks(this.project_id).ensure_directory_exists({
      path: p,
      cb: err => {
        if (err) {
          this.setState({
            file_creation_error: `Error creating directory '${p}' -- ${err}`
          });
        } else if (switch_over) {
          this.open_directory(p);
        } else {
          this.fetch_directory_listing();
        }
      }
    });
  }

  create_file(opts) {
    let p;
    opts = defaults(opts, {
      name: undefined,
      ext: undefined,
      current_path: undefined,
      switch_over: true
    }); // Whether or not to switch to the new file
    this.setState({ file_creation_error: undefined }); // clear any create file display state
    let { name } = opts;
    if ((name === ".." || name === ".") && opts.ext == null) {
      this.setState({
        file_creation_error: "Cannot create a file named . or .."
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
          current_path: opts.current_path
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
    const ext = misc.filename_extension(p);
    if (BANNED_FILE_TYPES.indexOf(ext) != -1) {
      this.setState({
        file_creation_error: `Cannot create a file with the ${ext} extension`
      });
      return;
    }
    if (ext === "tex") {
      const filename = misc.path_split(name).tail;
      for (let bad_char of BAD_LATEX_FILENAME_CHARACTERS) {
        if (filename.indexOf(bad_char) !== -1) {
          this.setState({
            file_creation_error: `Cannot use '${bad_char}' in a LaTeX filename '${filename}'`
          });
          return;
        }
      }
    }
    webapp_client.exec({
      project_id: this.project_id,
      command: "smc-new-file",
      timeout: 10,
      args: [p],
      err_on_exit: true,
      cb: (err, output) => {
        if (err) {
          let stdout = "";
          let stderr = "";
          if (output) {
            stdout = output.stdout || "";
            stderr = output.stderr || "";
          }
          this.setState({
            file_creation_error: `${stdout} ${stderr} ${err}`
          });
        } else if (opts.switch_over) {
          this.open_file({
            path: p
          });
        } else {
          this.fetch_directory_listing();
        }
      }
    });
  }

  new_file_from_web(url, current_path, cb?) {
    let d = current_path;
    if (d === "") {
      d = "root directory of project";
    }
    const id = misc.uuid();
    this.set_active_tab("files", { update_file_listing: false });
    this.set_activity({
      id,
      status: `Downloading '${url}' to '${d}', which may run for up to ${FROM_WEB_TIMEOUT_S} seconds...`
    });
    return this.get_from_web({
      url,
      dest: current_path,
      timeout: FROM_WEB_TIMEOUT_S,
      alert: true,
      cb: err => {
        this.fetch_directory_listing();
        this.set_activity({ id, stop: "" });
        return typeof cb === "function" ? cb(err) : undefined;
      }
    });
  }

  /*
   * Actions for PUBLIC PATHS
   */
  set_public_path(
    path,
    opts: {
      description?: string;
      unlisted?: boolean;
      license?: string;
      disabled?: boolean;
    }
  ) {
    let store = this.get_store();
    if (!store) {
      return;
    }

    const project_id = this.project_id;
    const id = client_db.sha1(project_id, path);

    const table = this.redux.getProjectTable(project_id, "public_paths");
    let obj: undefined | immutable.Map<string, any> = table._table.get(id);

    const now = misc.server_time();
    if (obj == null) {
      obj = immutable.fromJS({
        project_id,
        path,
        created: now
      });
    }
    if (obj == null) return; // make typescript happy

    // not allowed to write these back
    obj = obj.delete("last_saved");
    obj = obj.delete("counter");

    obj = obj.set("last_edited", now);

    for (let k in opts) {
      if (opts[k] != null) {
        obj = obj.set(k, opts[k]);
      }
    }
    table.set(obj);
  }

  /*
   * Actions for Project Search
   */

  toggle_search_checkbox_subdirectories() {
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    this.setState({ subdirectories: !store.get("subdirectories") });
  }

  toggle_search_checkbox_case_sensitive() {
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    this.setState({ case_sensitive: !store.get("case_sensitive") });
  }

  toggle_search_checkbox_hidden_files() {
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    this.setState({ hidden_files: !store.get("hidden_files") });
  }

  toggle_search_checkbox_git_grep() {
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    this.setState({ git_grep: !store.get("git_grep") });
  }

  process_search_results(err, output, max_results, max_output, cmd) {
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    if (err) {
      err = to_user_string(err);
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
    for (let line of results) {
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
          line_number
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
        search_results
      });
    }
  }

  search() {
    let cmd, ins;
    let store = this.get_store();
    if (store == undefined) {
      return;
    }

    const query = store
      .get("user_input")
      .trim()
      .replace(/"/g, '\\"');
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
      cmd = `git rev-parse --is-inside-work-tree && git grep -n -I -H ${ins} ${max_depth} ${search_query} || `;
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
      most_recent_path: store.get("current_path")
    });

    webapp_client.exec({
      project_id: this.project_id,
      command: cmd + " | cut -c 1-256", // truncate horizontal line length (imagine a binary file that is one very long line)
      timeout: 20, // how long grep runs on client
      network_timeout: 25, // how long network call has until it must return something or get total error.
      max_output,
      bash: true,
      err_on_exit: true,
      path: store.get("current_path"),
      cb: (err, output) => {
        this.process_search_results(err, output, max_results, max_output, cmd);
      }
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
    switch (segments[0]) {
      case "files":
        if (target[target.length - 1] === "/" || full_path === "") {
          //if DEBUG then console.log("ProjectStore::load_target → open_directory", parent_path)
          this.open_directory(parent_path, change_history);
          return;
        }
        let store = this.get_store();
        if (store == undefined) {
          return; // project closed already
        }
        let { item, err } = store.get_item_in_path(last, parent_path);
        if (item == null || err) {
          // Fetch again if error or nothing found
          try {
            await callback2(this.fetch_directory_listing, {
              path: parent_path
            });
            let store = this.get_store();
            if (store == undefined) {
              // project closed
              return;
            }
            const x = store.get_item_in_path(last, parent_path);
            if (x.err) throw Error(x.err);
            if (x.item == null) {
              item = immutable.Map(); // creating file
            } else {
              item = x.item;
            }
          } catch (err) {
            alert_message({
              type: "error",
              message: `Error opening '${target}': ${err}`
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
            anchor
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
    }
  }

  show_extra_free_warning(): void {
    this.setState({ free_warning_extra_shown: true });
  }

  close_free_warning(): void {
    this.setState({ free_warning_closed: true });
  }

  async set_compute_image(new_image: string): Promise<void> {
    await client_query({
      query: {
        projects: {
          project_id: this.project_id,
          compute_image: new_image
        }
      }
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
    let store = this.get_store();
    if (store == undefined) return; // project closed
    const a = store.get("active_project_tab");
    if (!startswith(a, "editor-")) return;
    await delay(0);
    this.show_file(misc.tab_to_path(a));
  }

  // called when project page is hidden
  async hide(): Promise<void> {
    let store = this.get_store();
    if (store == undefined) return; // project closed
    const a = store.get("active_project_tab");
    if (!startswith(a, "editor-")) return;
    this.hide_file(misc.tab_to_path(a));
  }
}

const prom_client = require("./prom-client");
if (prom_client.enabled) {
  prom_get_dir_listing_h = prom_client.new_histogram(
    "get_dir_listing_seconds",
    "get_directory_listing time",
    {
      buckets: [1, 2, 5, 7, 10, 15, 20, 30, 50],
      labels: ["public", "state", "err"]
    }
  );
}

export const get_directory_listing = function(opts) {
  let method, prom_dir_listing_start, prom_labels, state, time0, timeout;
  opts = defaults(opts, {
    project_id: required,
    path: required,
    hidden: required,
    max_time_s: required,
    group: required,
    cb: required
  });

  ({ webapp_client } = require("./webapp_client"));

  if (prom_client.enabled) {
    prom_dir_listing_start = misc.server_time();
    prom_labels = { public: false };
  }

  if (["owner", "collaborator", "admin"].indexOf(opts.group) != -1) {
    method = webapp_client.project_directory_listing;
    // Also, make sure project starts running, in case it isn't.
    state = (redux.getStore("projects") as any).getIn([
      "project_map",
      opts.project_id,
      "state",
      "state"
    ]);
    if (prom_client.enabled) {
      prom_labels.state = state;
    }
    if (state !== "running") {
      timeout = 0.5;
      time0 = misc.server_time();
      (redux.getActions("projects") as any).start_project(opts.project_id);
    } else {
      timeout = 1;
    }
  } else {
    state = time0 = undefined;
    method = webapp_client.public_project_directory_listing;
    timeout = 15;
    if (prom_client.enabled) {
      prom_labels.public = true;
    }
  }

  let listing: any;
  let listing_err: any;
  const f = cb => {
    // console.log("get_directory_listing.f ", opts.path);
    method({
      project_id: opts.project_id,
      path: opts.path,
      hidden: opts.hidden,
      timeout,
      cb(err, x) {
        if (err) {
          if (err.message != null) {
            if (err.message.indexOf("ENOENT") != -1) {
              listing_err = NO_DIR;
            } else if (err.message.indexOf("ENOTDIR") != -1) {
              listing_err = NOT_A_DIR;
            } else {
              listing_err = err.message;
            }
            cb();
          } else {
            // I don't think this happens anymore...
            if (timeout < 5) {
              timeout *= 1.3;
            }
            cb(err);
          }
        } else {
          listing = x;
          cb();
        }
      }
    });
  };

  return misc.retry_until_success({
    f,
    max_time: opts.max_time_s * 1000,
    start_delay: 100,
    max_delay: 1000,
    //log         : console.log
    cb(err) {
      //console.log opts.path, 'get_directory_listing.success or timeout', err
      if (prom_client.enabled && prom_dir_listing_start != null) {
        prom_labels.err = !!err;
        const tm = (misc.server_time() - prom_dir_listing_start) / 1000;
        if (!isNaN(tm)) {
          if (prom_get_dir_listing_h != null) {
            prom_get_dir_listing_h.observe(prom_labels, tm);
          }
        }
      }

      err = err != null ? err : listing_err;
      // no `err` error, but `listing` has no value, too
      // https://github.com/sagemathinc/cocalc/issues/3223
      if (!err && listing == null) {
        err = "no_dir";
      }
      opts.cb(err, listing);
      if (time0 && state !== "running" && !err) {
        // successfully opened, started, and got directory listing
        return redux.getProjectActions(opts.project_id).log({
          event: "start_project",
          time: misc.server_time() - time0
        });
      }
    }
  });
};
