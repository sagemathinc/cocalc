/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// TODO: we should refactor our code to not have these window/document/$ references here.
declare let window, document, $;

import * as async from "async";
import { callback } from "awaiting";
import { List, Map, fromJS, Set as immutableSet } from "immutable";
import { isEqual, throttle } from "lodash";
import { join } from "path";
import { defineMessage } from "react-intl";

import {
  computeServerManager,
  type ComputeServerManager,
} from "@cocalc/conat/compute/manager";
import { get as getProjectStatus } from "@cocalc/conat/project/project-status";
import { default_filename } from "@cocalc/frontend/account";
import { alert_message } from "@cocalc/frontend/alerts";
import {
  Actions,
  project_redux_name,
  redux,
} from "@cocalc/frontend/app-framework";
import type { ChatState } from "@cocalc/frontend/chat/chat-indicator";
import { initChat } from "@cocalc/frontend/chat/register";
import { IconName } from "@cocalc/frontend/components";
import * as computeServers from "@cocalc/frontend/compute/compute-servers-table";
import { modalParams } from "@cocalc/frontend/compute/select-server-for-file";
import { TabName, setServerTab } from "@cocalc/frontend/compute/tab";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { local_storage } from "@cocalc/frontend/editor-local-storage";
import { chatFile } from "@cocalc/frontend/frame-editors/generic/chat";
import {
  query as client_query,
  exec,
} from "@cocalc/frontend/frame-editors/generic/client";
import { set_url } from "@cocalc/frontend/history";
import { IntlMessage, dialogs } from "@cocalc/frontend/i18n";
import { getIntl } from "@cocalc/frontend/i18n/get-intl";
import {
  download_file,
  open_new_tab,
  open_popup_window,
  set_local_storage,
} from "@cocalc/frontend/misc";
import Fragment, { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import * as project_file from "@cocalc/frontend/project-file";
import { delete_files } from "@cocalc/frontend/project/delete-files";
import fetchDirectoryListing from "@cocalc/frontend/project/fetch-directory-listing";
import {
  ProjectEvent,
  SoftwareEnvironmentEvent,
} from "@cocalc/frontend/project/history/types";
import {
  OpenFileOpts,
  canonicalPath,
  log_file_open,
  log_opened_time,
  open_file,
} from "@cocalc/frontend/project/open-file";
import { OpenFiles } from "@cocalc/frontend/project/open-files";
import { FixedTab } from "@cocalc/frontend/project/page/file-tab";
import {
  FlyoutActiveMode,
  FlyoutLogDeduplicate,
  FlyoutLogMode,
  storeFlyoutState,
} from "@cocalc/frontend/project/page/flyouts/state";
import {
  FLYOUT_LOG_FILTER_DEFAULT,
  FlyoutLogFilter,
} from "@cocalc/frontend/project/page/flyouts/utils";
import { getValidVBAROption } from "@cocalc/frontend/project/page/vbar";
import { VBAR_KEY } from "@cocalc/frontend/project/page/vbar-consts";
import { ensure_project_running } from "@cocalc/frontend/project/project-start-warning";
import { transform_get_url } from "@cocalc/frontend/project/transform-get-url";
import {
  NewFilenames,
  download_href,
  in_snapshot_path,
  normalize,
  url_href,
} from "@cocalc/frontend/project/utils";
import { API } from "@cocalc/frontend/project/websocket/api";
import {
  Configuration,
  ConfigurationAspect,
  LIBRARY_INDEX_FILE,
  ProjectConfiguration,
  is_available as feature_is_available,
  get_configuration,
} from "@cocalc/frontend/project_configuration";
import {
  ModalInfo,
  ProjectStore,
  ProjectStoreState,
} from "@cocalc/frontend/project_store";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { once, retry_until_success } from "@cocalc/util/async-utils";
import { DEFAULT_NEW_FILENAMES, NEW_FILENAMES } from "@cocalc/util/db-schema";
import * as misc from "@cocalc/util/misc";
import { reduxNameToProjectId } from "@cocalc/util/redux/name";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { MARKERS } from "@cocalc/util/sagews";
import { client_db } from "@cocalc/util/schema";
import { get_editor } from "./editors/react-wrapper";

const { defaults, required } = misc;

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
      site_license_id: null,
      redirect: null,
      jupyter_api: null,
    },
  },
};

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
      "you must explicitly pass a redux object into each function in project_store",
    );
  }
};
const _init_library_index_ongoing = {};
const _init_library_index_cache = {};

interface FileAction {
  name: IntlMessage;
  icon: IconName;
  allows_multiple_files?: boolean;
  hideFlyout?: boolean;
}

export const FILE_ACTIONS: { [key: string]: FileAction } = {
  compress: {
    name: defineMessage({
      id: "file_actions.compress.name",
      defaultMessage: "Compress",
      description: "Compress a file",
    }),
    icon: "compress" as IconName,
    allows_multiple_files: true,
  },
  delete: {
    name: defineMessage({
      id: "file_actions.delete.name",
      defaultMessage: "Delete",
      description: "Delete a file",
    }),
    icon: "trash" as IconName,
    allows_multiple_files: true,
  },
  rename: {
    name: defineMessage({
      id: "file_actions.rename.name",
      defaultMessage: "Rename",
      description: "Rename a file",
    }),
    icon: "swap" as IconName,
    allows_multiple_files: false,
  },
  duplicate: {
    name: defineMessage({
      id: "file_actions.duplicate.name",
      defaultMessage: "Duplicate",
      description: "Duplicate a file",
    }),
    icon: "clone" as IconName,
    allows_multiple_files: false,
  },
  move: {
    name: defineMessage({
      id: "file_actions.move.name",
      defaultMessage: "Move",
      description: "Move a file",
    }),
    icon: "move" as IconName,
    allows_multiple_files: true,
  },
  copy: {
    name: defineMessage({
      id: "file_actions.copy.name",
      defaultMessage: "Copy",
      description: "Copy a file",
    }),
    icon: "files" as IconName,
    allows_multiple_files: true,
  },
  share: {
    name: defineMessage({
      id: "file_actions.publish.name",
      defaultMessage: "Publish",
      description: "Publish a file",
    }),
    icon: "share-square" as IconName,
    allows_multiple_files: false,
  },
  download: {
    name: defineMessage({
      id: "file_actions.download.name",
      defaultMessage: "Download",
      description: "Download a file",
    }),
    icon: "cloud-download" as IconName,
    allows_multiple_files: true,
  },
  upload: {
    name: defineMessage({
      id: "file_actions.upload.name",
      defaultMessage: "Upload",
      description: "Upload a file",
    }),
    icon: "upload" as IconName,
    hideFlyout: true,
  },
  create: {
    name: defineMessage({
      id: "file_actions.create.name",
      defaultMessage: "Create",
      description: "Create a file",
    }),
    icon: "plus-circle" as IconName,
    hideFlyout: true,
  },
} as const;

export class ProjectActions extends Actions<ProjectStoreState> {
  public state: "ready" | "closed" = "ready";
  public project_id: string;
  private _last_history_state: string;
  private last_close_timer: number;
  private _activity_indicator_timers: { [key: string]: number } = {};
  private _init_done = false;
  private new_filename_generator = new NewFilenames("", false);
  private modal?: ModalInfo;

  // these are all potentially expensive
  public open_files?: OpenFiles;
  private computeServerManager?: ComputeServerManager;
  private projectStatusSub?;

  constructor(name, b) {
    super(name, b);
    this.project_id = reduxNameToProjectId(name);
    this.open_files = new OpenFiles(this);
    // console.log("create project actions", this.project_id);
    // console.trace("create project actions", this.project_id)
    this.expensiveLoop();
  }

  // COST -- there's a lot of code all over that may create project actions,
  // e.g., when configuring a course with 150 students, then 150 project actions
  // get created to do various operations.   The big use of project actions
  // though is when an actual tab is open in the UI with projects.
  // So we put actions in two states: 'cheap' and 'expensive'.
  // In the expensive state, there can be compute server changefeeds,
  // etc.  In the cheap state we close all that.  When the tab is
  // visibly open in the UI then expensive stuff automatically gets
  // initialized, and when it is closed, it is destroyed.

  // actually open in the UI?
  private lastProjectTabs: List<string> = List([]);
  private lastProjectTabOpenedState = false;
  isTabOpened = () => {
    const store = redux.getStore("projects");
    if (store == null) {
      return false;
    }
    const projectTabs = store.get("open_projects") as List<string> | undefined;
    if (projectTabs == null) {
      return false;
    }
    if (projectTabs.equals(this.lastProjectTabs)) {
      return this.lastProjectTabOpenedState;
    }
    this.lastProjectTabs = projectTabs;
    this.lastProjectTabOpenedState = projectTabs.includes(this.project_id);
    return this.lastProjectTabOpenedState;
  };
  isTabClosed = () => !this.isTabOpened();

  private expensiveLoop = async () => {
    while (this.state != "closed") {
      if (this.isTabOpened()) {
        this.initExpensive();
      } else {
        this.closeExpensive();
      }
      const store = redux.getStore("projects");
      if (store != null) {
        await once(store, "change");
      }
    }
  };

  private initialized = false;
  private initExpensive = () => {
    if (this.initialized) return;
    // console.log("initExpensive", this.project_id);
    this.initialized = true;
    this.initComputeServerManager();
    this.initComputeServersTable();
    this.initProjectStatus();
    const store = this.get_store();
    store?.init_table("public_paths");
  };

  private closeExpensive = () => {
    if (!this.initialized) return;
    // console.log("closeExpensive", this.project_id);
    this.initialized = false;
    redux.removeProjectReferences(this.project_id);
    this.closeComputeServerManager();
    this.closeComputeServerTable();
    this.projectStatusSub?.close();
    delete this.projectStatusSub;
    must_define(this.redux);
    this.close_all_files();
    for (const table in QUERIES) {
      this.remove_table(table);
    }

    webapp_client.conat_client.closeOpenFiles(this.project_id);

    const store = this.get_store();
    store?.close_all_tables();
  };

  public async api(): Promise<API> {
    return await webapp_client.project_client.api(this.project_id);
  }

  destroy = (): void => {
    // console.log("destroy project actions", this.project_id);
    if (this.state == "closed") {
      return;
    }
    this.closeExpensive();
    this.open_files?.close();
    delete this.open_files;
    this.state = "closed";
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
  touch = async (compute_server_id?: number): Promise<void> => {
    try {
      await webapp_client.project_client.touch_project(
        this.project_id,
        compute_server_id,
      );
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
    // this would have to do precisely what kucalc's project init does.
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
      const type =
        acc_store?.getIn(["other_settings", NEW_FILENAMES]) ??
        DEFAULT_NEW_FILENAMES;
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

  set_url_to_path(current_path, hash?: string): void {
    if (current_path.length > 0 && !misc.endswith(current_path, "/")) {
      current_path += "/";
    }
    this.push_state(`files/${current_path}`, hash);
  }

  _url_in_project(local_url): string {
    return `/projects/${this.project_id}/${misc.encode_path(local_url)}`;
  }

  push_state(local_url?: string, hash?: string): void {
    if (local_url == null) {
      local_url = this._last_history_state ?? "files/";
    }
    this._last_history_state = local_url;
    set_url(this._url_in_project(local_url), hash);
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
        const account_store = this.redux.getStore("account") as any;
        const vbar = account_store?.getIn(["other_settings", VBAR_KEY]);
        const flyoutsDefault = getValidVBAROption(vbar) === "flyout";
        next_active_tab = flyoutsDefault ? "home" : "files";
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
      noFocus?: boolean;
    } = {
      update_file_listing: true,
      change_history: true,
    },
  ): void {
    const store = this.get_store();
    if (store == undefined) return; // project closed
    const prev_active_project_tab = store.get("active_project_tab");
    if (!opts.change_history && prev_active_project_tab === key) {
      // already active -- nothing further to do
      return;
    }
    if (prev_active_project_tab) {
      // do not keep fragment from tab that is being hidden
      Fragment.clear();
    }
    if (
      prev_active_project_tab !== key &&
      prev_active_project_tab.startsWith("editor-")
    ) {
      this.hide_file(misc.tab_to_path(prev_active_project_tab));
    }
    const change: any = { active_project_tab: key };
    switch (key) {
      case "files":
        if (opts.change_history) {
          this.set_url_to_path(store.get("current_path") ?? "", "");
        }
        if (opts.update_file_listing) {
          this.fetch_directory_listing();
        }
        break;

      case "new":
        change.file_creation_error = undefined;
        if (opts.change_history) {
          this.push_state(`new/${store.get("current_path")}`, "");
        }
        const new_fn = default_filename(opts.new_ext, this.project_id);
        this.set_next_default_filename(new_fn);
        break;

      case "log":
        if (opts.change_history) {
          this.push_state("log", "");
        }
        break;

      case "search":
        if (opts.change_history) {
          this.push_state(`search/${store.get("current_path")}`, "");
        }
        break;

      case "servers":
        if (opts.change_history) {
          this.push_state("servers", "");
        }
        break;

      case "settings":
        if (opts.change_history) {
          this.push_state("settings", "");
        }
        break;

      case "info":
        if (opts.change_history) {
          this.push_state("info", "");
        }
        break;

      case "home":
        if (opts.change_history) {
          this.push_state("home", "");
        }
        break;

      case "users":
        if (opts.change_history) {
          this.push_state("users", "");
        }
        break;

      case "upgrades":
        if (opts.change_history) {
          this.push_state("upgrades", "");
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
          redux.getProjectsStore().get_my_group(this.project_id) === "public";

        const info = store.get("open_files").getIn([path, "component"]) as any;
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
              is_public,
              this.open_files?.get(path, "ext"),
            );
            if (this.open_files == null) return;
            info.redux_name = name;
            info.Editor = Editor;
            // IMPORTANT: we make a *copy* of info below to trigger an update
            // of the component that displays this editor.  Otherwise, the user
            // would just see a spinner until they tab away and tab back.
            this.open_files.set(path, "component", { ...info });
            // just like in the case where it is already loaded, we have to "show" it.
            // this is important, because e.g. the store has a "visible" field, which stays undefined
            // which in turn causes e.g. https://github.com/sagemathinc/cocalc/issues/5398
            if (!opts.noFocus) {
              this.show_file(path);
            }
            // If a fragment identifier is set, we also jump there.
            const fragmentId = store
              .get("open_files")
              .getIn([path, "fragmentId"]) as any;
            if (fragmentId) {
              this.gotoFragment(path, fragmentId);
            }
            if (this.open_files.get(path, "chatState") == "pending") {
              this.open_chat({ path });
            }
          })();
        } else {
          if (!opts.noFocus) {
            this.show_file(path);
          }
        }
    }
    this.setState(change);
  }

  public toggleFlyout(name: FixedTab): void {
    const store = this.get_store();
    if (store == undefined) return;
    const flyout = name === store.get("flyout") ? null : name;
    this.setState({ flyout });
    // also store this in local storage
    storeFlyoutState(this.project_id, name, { expanded: flyout != null });
    if (flyout != null) {
      track("flyout", { name: flyout, project_id: this.project_id });
    }
  }

  public setFlyoutExpanded(name: FixedTab, state: boolean, save = true): void {
    this.setState({ flyout: state ? name : null });
    // also store this in local storage
    if (save) {
      storeFlyoutState(this.project_id, name, { expanded: name != null });
    }
  }

  public setFlyoutLogMode(mode: FlyoutLogMode): void {
    this.setState({ flyout_log_mode: mode });
    storeFlyoutState(this.project_id, "log", { mode });
  }

  public setFlyoutLogDeduplicate(deduplicate: FlyoutLogDeduplicate): void {
    this.setState({ flyout_log_deduplicate: deduplicate });
    storeFlyoutState(this.project_id, "log", { deduplicate });
  }

  public setFlyoutLogFilter(filter: FlyoutLogFilter, state: boolean): void {
    const store = this.get_store();
    if (store == undefined) return;
    const current: string[] =
      store.get("flyout_log_filter")?.toJS() ?? FLYOUT_LOG_FILTER_DEFAULT;

    // depending on state, make sure the filter is either in the list or not
    const next = (
      state ? [...current, filter] : current.filter((f) => f !== filter)
    ) as FlyoutLogFilter[];

    this.setState({ flyout_log_filter: List(next) });
    storeFlyoutState(this.project_id, "log", { logFilter: next });
  }

  public resetFlyoutLogFilter(): void {
    this.setState({ flyout_log_filter: List(FLYOUT_LOG_FILTER_DEFAULT) });
    storeFlyoutState(this.project_id, "log", {
      logFilter: [...FLYOUT_LOG_FILTER_DEFAULT],
    });
  }

  public setFlyoutActiveMode(mode: FlyoutActiveMode): void {
    this.setState({ flyout_active_mode: mode });
    storeFlyoutState(this.project_id, "active", { active: mode });
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
      error: undefined, // describe an error that happened
    });
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
    cb?: (err?: any) => void,
  ): string | undefined;
  log(event: ProjectEvent, id?: string, cb?: Function): string | undefined {
    const my_role = (this.redux.getStore("projects") as any).get_my_group(
      this.project_id,
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
        "*",
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

    const path_data = store
      .get("open_files")
      .getIn([opts.path, "component"]) as any;
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
  open_file = async (opts: OpenFileOpts): Promise<void> => {
    // Log that we *started* opening the file.
    log_file_open(this.project_id, opts.path);
    await open_file(this, opts);
  };

  /* Initialize the redux store and react component for editing
     a particular file.
  */
  initFileRedux = async (
    path: string,
    is_public: boolean = false,
    ext?: string, // use this extension even instead of path's extension.
  ): Promise<string | undefined> => {
    // LAZY IMPORT, so that editors are only available
    // when you are going to use them.  Helps with code splitting.
    await import("./editors/register-all");

    // Initialize the file's store and actions
    const name = await project_file.initializeAsync(
      path,
      this.redux,
      this.project_id,
      is_public,
      undefined,
      ext,
    );
    return name;
  };

  private init_file_react_redux = async (
    path: string,
    is_public: boolean,
    ext?: string,
  ): Promise<{ name: string | undefined; Editor: any }> => {
    const name = await this.initFileRedux(path, is_public, ext);

    // Make the Editor react component
    const Editor = await project_file.generateAsync(
      path,
      this.redux,
      this.project_id,
      is_public,
      ext,
    );

    return { name, Editor };
  };

  get_scroll_saver_for = (path: string) => {
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
        const info = store!.get("open_files").getIn([path, "component"]) as any;
        info.scroll_position = scroll_position; // Yes, this mutates the store silently.
        return scroll_position;
      };
    }
  };

  // Moves to the given fragment if the gotoFragment action is implemented and accepted,
  // and the file actions exist already (e.g. file was opened).
  // Otherwise, silently does nothing.  Has a fallback for now for fragmentId='line=[number]'.
  public gotoFragment(path: string, fragmentId: FragmentId): void {
    // console.log("gotoFragment", { path, fragmentId });
    if (typeof fragmentId != "object") {
      console.warn(`gotoFragment -- invalid fragmentId: "${fragmentId}"`);
      return;
    }
    const actions: any = redux.getEditorActions(this.project_id, path);
    const store = this.get_store();
    // We ONLY actually goto the fragment if the file is the active one
    // in the active project and the actions for that file have been created.
    // Otherwise, we just save the fragment for later when the file is opened
    // and this.show_file gets called, thus triggering all this again.
    if (
      actions != null &&
      store != null &&
      path == misc.tab_to_path(store.get("active_project_tab")) &&
      this.isProjectTabVisible()
    ) {
      // Clear the fragmentId from the "todo" state, so we won't try to use
      // this next time we display the file:
      this.open_files?.set(path, "fragmentId", undefined);
      // The file is actually visible, so we can try to scroll to the fragment.
      // set the fragment in the URL if the file is in the foreground
      Fragment.set(fragmentId);
      if (actions.gotoFragment != null) {
        actions.gotoFragment(fragmentId);
        return;
      }
      // a fallback for now.
      if (fragmentId.line != null) {
        this.goto_line(path, fragmentId.line, true, true);
        return;
      }
    } else {
      // File is NOT currently visible, so going to the fragment is likely
      // to break for many editors.  e.g., codemirror background editor just
      // does nothing since it has no DOM measurements...
      // Instead we record the fragment we want to be at, and when the
      // tab is next shown, it will move there.
      this.open_files?.set(path, "fragmentId", fragmentId);
    }
  }

  // Returns true if this project is the currently selected top nav.
  public isProjectTabVisible(): boolean {
    return this.redux.getStore("page").get("active_top_tab") == this.project_id;
  }

  // If the given path is open, and editor supports going to line,
  // moves to the given line.  Otherwise, does nothing.
  public goto_line(path, line, cursor?: boolean, focus?: boolean): void {
    const actions: any = redux.getEditorActions(this.project_id, path);
    if (actions == null) {
      // try non-react editor
      const editor = get_editor(this.project_id, path);
      if (
        editor != null &&
        typeof editor.programmatical_goto_line === "function"
      ) {
        editor.programmatical_goto_line(line);
        // TODO: For an old non-react editor (basically just sage worksheets at this point!)
        // we have to just use this flaky hack, since we are going to toss all this
        // code soon.  This is needed since if editor is just *loading*, should wait until it
        // finishes before actually jumping to line, but that's not implemented in editor.coffee.
        setTimeout(() => {
          editor.programmatical_goto_line(line);
        }, 1000);
        setTimeout(() => {
          editor.programmatical_goto_line(line);
        }, 2000);
      }
    } else if (actions.programmatical_goto_line != null) {
      actions.programmatical_goto_line(line, cursor, focus);
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
      a.show?.();
    }
    const fragmentId = this.open_files?.get(path, "fragmentId");
    if (fragmentId) {
      // have to wait for next render so that local store is updated and
      // also any rendering and measurement happens with the editor.
      setTimeout(() => {
        this.gotoFragment(path, fragmentId);
      }, 0);
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
  set_chat_state(path: string, chatState: ChatState): void {
    if (this.open_files == null) {
      return;
    }
    this.open_files.set(path, "chatState", chatState);
    local_storage(this.project_id, path, "chatState", chatState);
  }

  // Open side chat for the given file, assuming the file is open, store is initialized, etc.
  open_chat = ({ path, width = 0.7 }: { path: string; width?: number }) => {
    const info = this.get_store()
      ?.get("open_files")
      .getIn([path, "component"]) as any;
    if (info?.Editor == null) {
      // not opened in the foreground yet.
      this.set_chat_state(path, "pending");
      return;
    }
    //  not null for modern editors.
    const editorActions = redux.getEditorActions(this.project_id, path);
    if (editorActions?.["show_focused_frame_of_type"] != null) {
      // @ts-ignore -- todo will go away when everything is a frame editor
      editorActions.show_focused_frame_of_type("chat", "col", false, width);
      this.set_chat_state(path, "internal");
    } else {
      // First create the chat actions:
      initChat(this.project_id, misc.meta_file(path, "chat"));
      // Only then set state to say that the chat is opened!
      // Otherwise when the opened chat is rendered actions is
      // randomly not defined, and things break.
      this.set_chat_state(path, "external");
    }
  };

  // Close side chat for the given file, assuming the file itself is open
  // NOTE: for frame tree if there are no chat frames, this instead opens
  // a chat frame.
  close_chat({ path }: { path: string }): void {
    const editorActions = redux.getEditorActions(this.project_id, path);
    if (editorActions?.["close_recently_focused_frame_of_type"] != null) {
      let n = 0;
      // @ts-ignore -- todo will go away when everything is a frame editor
      while (editorActions.close_recently_focused_frame_of_type("chat")) {
        n += 1;
      }
      if (n == 0) {
        // nothing actually closed - so we open
        // TODO: This is just a workaround until we only use frame editors.
        this.open_chat({ path });
        return;
      }
      this.set_chat_state(path, "");
    } else {
      this.set_chat_state(path, "");
    }
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
      1000,
    );

    this.open_files.set(filename, "has_activity", true);
    this.touchActiveFileIfOnComputeServer(filename);
  }

  private touchActiveFileIfOnComputeServer = throttle(async (path: string) => {
    if (this.state == "closed") {
      return;
    }
    const computeServerAssociations =
      webapp_client.project_client.computeServers(this.project_id);
    // this is what is currently configured:
    const compute_server_id =
      await computeServerAssociations.getServerIdForPath(path);
    if (compute_server_id) {
      await this.touch(compute_server_id);
    }
  }, 15000);

  private async convert_docx_file(filename): Promise<string> {
    const conf = await this.init_configuration("main");
    if (conf != null && conf.capabilities.pandoc === false) {
      throw new Error(
        "Pandoc not installed – unable to convert docx to markdown.",
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
      const component_data = obj.get("component");
      const is_public = component_data ? component_data.is_public : undefined;
      project_file.remove(path, this.redux, this.project_id, is_public);
    });

    this.open_files?.close_all();
  }

  // Closes the file and removes all references.
  // Does not update tabs
  close_file = (path: string): void => {
    path = normalize(path);
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const open_files = store.get("open_files");
    const component_data = open_files.getIn([path, "component"]) as any;
    if (component_data == null) return; // nothing to do since already closed.
    this.open_files?.delete(path);
    project_file.remove(
      path,
      this.redux,
      this.project_id,
      component_data.is_public,
    );
    this.save_session();
  };

  // Makes this project the active project tab
  foreground_project = (change_history = true): void => {
    this._ensure_project_is_open((err) => {
      if (err) {
        // TODO!
        console.warn(
          "error putting project in the foreground: ",
          err,
          this.project_id,
        );
      } else {
        (this.redux.getActions("projects") as any).foreground_project(
          this.project_id,
          change_history,
        );
      }
    });
  };

  open_directory(path, change_history = true, show_files = true): void {
    path = normalize(path);
    this._ensure_project_is_open(async (err) => {
      if (err) {
        // TODO!
        console.log(
          "error opening directory in project: ",
          err,
          this.project_id,
          path,
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
            change_history: false, // see "if" below
          });
        }
        if (change_history) {
          // i.e. regardless of show_files is true or false, we might want to record this in the history
          this.set_url_to_path(store.get("current_path") ?? "", "");
        }
        this.set_all_files_unchecked();
      }
    });
  }

  // ONLY updates current path
  // Does not push to URL, browser history, or add to analytics
  // Use internally or for updating current path in background
  set_current_path = (path: string = ""): void => {
    path = normalize(path);
    if (Number.isNaN(path as any)) {
      path = "";
    }
    if (typeof path !== "string") {
      throw Error("Current path should be a string");
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
      this.clear_selected_file_index();
    }
    this.setState({
      current_path: path,
      history_path,
      page_number: 0,
      most_recent_file_click: undefined,
    });
    this.fetch_directory_listing({ path });
  };

  setComputeServerId = (compute_server_id: number) => {
    if (compute_server_id == null) {
      throw Error("bug");
    }
    const store = this.get_store();
    if (store == null) return;
    if (store.get("compute_server_id") == compute_server_id) {
      // already set
      return;
    }
    this.setState({
      compute_server_id,
      checked_files: store.get("checked_files").clear(), // always clear on compute_server_id change
    });
    this.fetch_directory_listing({ compute_server_id });
    set_local_storage(
      store.computeServerIdLocalStorageKey,
      `${compute_server_id}`,
    );
  };

  // sets the side chat compute server id properly for the given path.
  setSideChatComputeServerId = async (path) => {
    const computeServerAssociations =
      webapp_client.project_client.computeServers(this.project_id);
    const sidePath = chatFile(path);
    const currentId = await computeServerAssociations.getServerIdForPath(
      sidePath,
    );
    if (currentId != null) {
      // already set
      return;
    }
    const id = await computeServerAssociations.getServerIdForPath(path);
    if (!id) {
      // nothing to set -- default is fine
      return;
    }
    // set it
    computeServerAssociations.connectComputeServerToPath({
      id,
      path: sidePath,
    });
    await computeServerAssociations.save();
  };

  set_file_search(search): void {
    this.setState({
      file_search: search,
      page_number: 0,
      file_action: undefined,
      most_recent_file_click: undefined,
      create_file_alert: false,
    });
  }

  // Update the directory listing cache for the given path.
  // Uses current path if path not provided.
  async fetch_directory_listing(opts?): Promise<void> {
    await fetchDirectoryListing(this, opts);
  }

  public async fetch_directory_listing_directly(
    path: string,
    trigger_start_project?: boolean,
    compute_server_id?: number,
  ): Promise<void> {
    const store = this.get_store();
    if (store == null) return;
    compute_server_id = this.getComputeServerId(compute_server_id);
    const listings = store.get_listings(compute_server_id);
    try {
      const files = await listings.getListingDirectly(
        path,
        trigger_start_project,
      );
      const directory_listings = store.get("directory_listings");
      let listing = directory_listings.get(compute_server_id) ?? Map();
      listing = listing.set(path, files);
      this.setState({
        directory_listings: directory_listings.set(compute_server_id, listing),
      });
    } catch (err) {
      console.warn(`Unable to fetch directory listing -- "${err}"`);
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
      checked_files?: immutableSet<string>;
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
      checked_files: immutableSet<string>;
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
      checked_files: immutableSet<string>;
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
    const compute_server_id = store.get("compute_server_id");
    const listing = store.getIn([
      "directory_listings",
      compute_server_id,
      store.get("current_path"),
    ]);

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

  suggestDuplicateFilenameInCurrentDirectory = (
    name: string,
  ): string | undefined => {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }

    // fallback to name, simple fallback
    const filesInDir = this.get_filenames_in_current_dir() || name;
    // This loop will keep trying new names until one isn't in the directory,
    // because the name keeps changing and filesInDir is finite.
    while (true) {
      name = misc.suggest_duplicate_filename(name);
      if (!filesInDir[name]) {
        return name;
      }
    }
  };

  set_file_action(action?: string): void {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    this.setState({ file_action: action });
  }

  show_file_action_panel(opts): void {
    opts = defaults(opts, {
      path: required,
      action: required,
    });
    this.set_all_files_unchecked();
    if (opts.action == "new" || opts.action == "create") {
      // special case because it isn't a normal "file action panel",
      // but it is convenient to still support this.
      if (this.get_store()?.get("flyout") != "new") {
        this.toggleFlyout("new");
      }
      this.setState({
        default_filename: default_filename(
          misc.filename_extension(opts.path),
          this.project_id,
        ),
      });
      return;
    }
    if (opts.action == "upload") {
      this.set_active_tab("files");
      setTimeout(() => {
        // NOTE: I'm not proud of this, but right now our upload functionality
        // is based on not-very-react-ish library...
        $(".upload-button").click();
      }, 100);
      return;
    }
    if (opts.action == "open") {
      if (this.get_store()?.get("flyout") != "files") {
        this.toggleFlyout("files");
      }
      return;
    }
    if (opts.action == "open_recent") {
      if (this.get_store()?.get("flyout") != "log") {
        this.toggleFlyout("log");
      }
      return;
    }

    const path_splitted = misc.path_split(opts.path);
    this.open_directory(path_splitted.head);

    if (opts.action == "quit") {
      // TODO: for jupyter and terminal at least, should also do more!
      this.close_tab(opts.path);
      return;
    }
    if (opts.action == "close") {
      this.close_tab(opts.path);
      return;
    }
    this.set_file_checked(opts.path, true);
    this.set_file_action(opts.action);
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
    return (err?, output?) => {
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

  zip_files = async ({
    src,
    dest,
    path,
  }: {
    src: string[];
    dest: string;
    path?: string;
  }) => {
    const args = ["-rq", dest, ...src];
    const id = misc.uuid();
    this.set_activity({
      id,
      status: `Creating ${dest} from ${src.length} ${misc.plural(
        src.length,
        "file",
      )}`,
    });
    try {
      this.log({ event: "file_action", action: "created", files: [dest] });
      await webapp_client.exec({
        project_id: this.project_id,
        command: "zip",
        args,
        timeout: 10 * 60 /* compressing CAN take a while -- zip is slow! */,
        err_on_exit: true, // this should fail if exit_code != 0
        compute_server_id: this.get_store()?.get("compute_server_id"),
        filesystem: true,
        path,
      });
    } catch (err) {
      this.set_activity({ id, error: `${err}` });
      throw err;
    } finally {
      this.set_activity({ id, stop: "" });
      this.fetch_directory_listing();
    }
  };

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
  init_configuration = reuseInFlight(
    async (
      aspect: ConfigurationAspect = "main",
      no_cache = false,
    ): Promise<Configuration | void> => {
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
              no_cache,
            );
          } catch (e) {
            // not implemented error happens, when the project is still the old one
            // in that case, do as if everything is available
            if (e.message.indexOf("not implemented") >= 0) {
              return null;
            }
            //             console.log(
            //               `WARNING -- project_actions::init_configuration err: ${e}`,
            //             );
            throw e;
          }
        },
        start_delay: 2000,
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
        } as any),
      );

      return next.get(aspect) as Configuration;
    },
  );

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
        cb(err.statusText != null ? err.statusText : "error"),
      );
    };

    misc.retry_until_success({
      f: fetch,
      start_delay: 15000,
      max_delay: 30000,
      max_time: 1000 * 60, // try for at most 3 minutes
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

  copy_paths = async (opts: {
    src: string[];
    dest: string;
    id?: string;
    only_contents?: boolean;
    // defaults to the currently selected compute server
    src_compute_server_id?: number;
    // defaults to the currently selected compute server
    dest_compute_server_id?: number;
    // NOTE: right now src_compute_server_id and dest_compute_server_id
    // must be the same or one of them must be 0.  We don't implement
    // copying directly from one compute server to another *yet*.
  }) => {
    opts = defaults(opts, {
      src: required, // Should be an array of source paths
      dest: required,
      id: undefined,
      only_contents: false,
      src_compute_server_id: this.get_store()?.get("compute_server_id") ?? 0,
      dest_compute_server_id: this.get_store()?.get("compute_server_id") ?? 0,
    }); // true for duplicating files

    const with_slashes = opts.src.map(this._convert_to_displayed_path);

    this.log({
      event: "file_action",
      action: "copied",
      files: with_slashes.slice(0, 3),
      count: opts.src.length > 3 ? opts.src.length : undefined,
      dest: opts.dest + (opts.only_contents ? "" : "/"),
      ...(opts.src_compute_server_id != opts.dest_compute_server_id
        ? {
            src_compute_server_id: opts.src_compute_server_id,
            dest_compute_server_id: opts.dest_compute_server_id,
          }
        : opts.src_compute_server_id
        ? { compute_server_id: opts.src_compute_server_id }
        : undefined),
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
        "file",
      )} to ${opts.dest}`,
    });

    if (opts.src_compute_server_id != opts.dest_compute_server_id) {
      // Copying from/to a compute server from/to a project.  This uses
      // an api, which behind the scenes uses lz4 compression and tar
      // proxied via a websocket, but no use of rsync or ssh.

      // do it.
      try {
        const api = await this.api();
        if (opts.src_compute_server_id) {
          // from compute server to project
          await api.copyFromComputeServerToHomeBase({
            compute_server_id: opts.src_compute_server_id,
            paths: opts.src,
            dest: opts.dest,
            timeout: 60 * 15 * 1000,
          });
        } else if (opts.dest_compute_server_id) {
          // from project to compute server
          await api.copyFromHomeBaseToComputeServer({
            compute_server_id: opts.dest_compute_server_id,
            paths: opts.src,
            dest: opts.dest,
            timeout: 60 * 15 * 1000,
          });
        } else {
          // Not implemented between two distinct compute servers yet.
          throw Error(
            "copying directly between compute servers is not yet implemented",
          );
        }
        this._finish_exec(id)();
      } catch (err) {
        this._finish_exec(id)(`${err}`);
      }

      return;
    }

    // Copying directly on project or on compute server. This just uses local rsync (no network).

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
      compute_server_id: opts.src_compute_server_id,
      filesystem: true,
      cb: this._finish_exec(id),
    });
  };

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
        "path",
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
        misc.path_split(src_path).tail,
      );
      opts0.timeout = 90 * 1000;
      try {
        await webapp_client.project_client.copy_path_between_projects(opts0);
        cb();
      } catch (err) {
        cb(err);
      }
    };
    async.mapLimit(src, 3, f, this._finish_exec(id, opts.cb));
  }

  public async rename_file(opts: {
    src: string;
    dest: string;
    compute_server_id?: number;
  }): Promise<void> {
    const id = misc.uuid();
    const status = `Renaming ${opts.src} to ${opts.dest}`;
    let error: any = undefined;
    const intl = await getIntl();
    const what = intl.formatMessage(dialogs.project_actions_rename_file, {
      src: opts.src,
    });
    if (!(await ensure_project_running(this.project_id, what))) {
      return;
    }

    this.set_activity({ id, status });
    try {
      const api = await this.api();
      const compute_server_id = this.getComputeServerId(opts.compute_server_id);
      await api.rename_file(opts.src, opts.dest, compute_server_id);
      this.log({
        event: "file_action",
        action: "renamed",
        src: opts.src,
        dest: opts.dest + ((await this.isdir(opts.dest)) ? "/" : ""),
        compute_server_id,
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
    compute_server_id?: number;
  }): Promise<void> {
    if (
      !(await ensure_project_running(
        this.project_id,
        "move " + opts.src.join(", "),
      ))
    ) {
      return;
    }
    const id = misc.uuid();
    const status = `Moving ${opts.src.length} ${misc.plural(
      opts.src.length,
      "file",
    )} to ${opts.dest}`;
    this.set_activity({ id, status });
    let error: any = undefined;
    try {
      const api = await this.api();
      const compute_server_id = this.getComputeServerId(opts.compute_server_id);
      await api.move_files(opts.src, opts.dest, compute_server_id);
      this.log({
        event: "file_action",
        action: "moved",
        files: opts.src,
        dest: opts.dest + "/" /* target is assumed to be a directory */,
        compute_server_id,
      });
    } catch (err) {
      error = err;
    } finally {
      this.set_activity({ id, stop: "", error });
    }
  }

  private checkForSandboxError(message): boolean {
    const projectsStore = this.redux.getStore("projects");
    if (projectsStore.isSandbox(this.project_id)) {
      const group = projectsStore.get_my_group(this.project_id);
      if (group != "owner" && group != "admin") {
        alert_message({
          type: "error",
          message,
        });
        return true;
      }
    }
    return false;
  }

  public async delete_files(opts: {
    paths: string[];
    compute_server_id?: number;
  }): Promise<void> {
    let mesg;
    opts = defaults(opts, {
      paths: required,
      compute_server_id: this.get_store()?.get("compute_server_id") ?? 0,
    });
    if (opts.paths.length === 0) {
      return;
    }

    if (
      this.checkForSandboxError(
        "Deleting files is not allowed in a sandbox project.   Create your own private project in the Projects tab in the upper left.",
      )
    ) {
      return;
    }

    if (
      !(await ensure_project_running(
        this.project_id,
        `delete ${opts.paths.join(", ")}`,
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
      await delete_files(this.project_id, opts.paths, opts.compute_server_id);
      this.log({
        event: "file_action",
        action: "deleted",
        files: opts.paths,
        compute_server_id: opts.compute_server_id,
      });
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

  download_file = async ({
    path,
    log = false,
    auto = true,
    print = false,
    compute_server_id,
  }: {
    path: string;
    log?: boolean | string[];
    auto?: boolean;
    print?: boolean;
    compute_server_id?: number;
  }): Promise<void> => {
    let url;
    compute_server_id = this.getComputeServerId(compute_server_id);
    if (
      !(await ensure_project_running(
        this.project_id,
        `download the file '${path}'`,
      ))
    ) {
      return;
    }

    // log could also be an array of strings to record all the files that were downloaded in a zip file
    if (log) {
      const files = Array.isArray(log) ? log : [path];
      this.log({
        event: "file_action",
        action: "downloaded",
        files,
      });
    }

    if (auto && !print) {
      url = download_href(this.project_id, path, compute_server_id);
      download_file(url);
    } else {
      url = url_href(this.project_id, path, compute_server_id);
      const tab = open_new_tab(url);
      if (tab != null && print) {
        // "?" since there might be no print method -- could depend on browser API
        tab.print?.();
      }
    }
  };

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
  public construct_absolute_path(
    name: string,
    current_path?: string,
    ext?: string,
  ) {
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
    compute_server_id?: number;
  }): Promise<void> {
    let p;
    opts = defaults(opts, {
      name: required,
      current_path: undefined,
      switch_over: true, // Whether or not to switch to the new folder
      compute_server_id: undefined,
    });
    if (
      !(await ensure_project_running(
        this.project_id,
        `create the folder '${opts.name}'`,
      ))
    ) {
      return;
    }
    let { compute_server_id, name } = opts;
    const { current_path, switch_over } = opts;
    compute_server_id = this.getComputeServerId(compute_server_id);
    this.setState({ file_creation_error: undefined });
    if (name[name.length - 1] === "/") {
      name = name.slice(0, -1);
    }
    try {
      p = this.construct_absolute_path(name, current_path);
    } catch (e) {
      this.setState({ file_creation_error: e.message });
      return;
    }
    try {
      await this.ensure_directory_exists(p, compute_server_id);
    } catch (err) {
      this.setState({
        file_creation_error: `Error creating directory '${p}' -- ${err}`,
      });
      return;
    }
    this.fetch_directory_listing({ path: p, compute_server_id });
    if (switch_over) {
      this.open_directory(p);
    }
    // Log directory creation to the event log.  / at end of path says it is a directory.
    this.log({ event: "file_action", action: "created", files: [p + "/"] });
  }

  create_file = async (opts: {
    name: string;
    ext?: string;
    current_path?: string;
    switch_over?: boolean;
    compute_server_id?: number;
  }) => {
    let p;
    opts = defaults(opts, {
      name: undefined,
      ext: undefined,
      current_path: undefined,
      switch_over: true, // Whether or not to switch to the new file
      compute_server_id: undefined,
    });
    const compute_server_id = this.getComputeServerId(opts.compute_server_id);
    this.setState({ file_creation_error: undefined }); // clear any create file display state
    let { name } = opts;
    if ((name === ".." || name === ".") && opts.ext == null) {
      this.setState({
        file_creation_error: "Cannot create a file named . or ..",
      });
      return;
    }
    if (misc.is_only_downloadable(name)) {
      this.new_file_from_web(name, opts.current_path ?? "");
      return;
    }
    if (name[name.length - 1] === "/") {
      if (opts.ext == null) {
        this.create_folder({
          name,
          current_path: opts.current_path,
          compute_server_id,
        });
        return;
      } else {
        name = name.slice(0, name.length - 1);
      }
    }
    try {
      p = this.construct_absolute_path(name, opts.current_path, opts.ext);
    } catch (e) {
      console.warn("Absolute path creation error");
      this.setState({ file_creation_error: e.message });
      return;
    }

    const intl = await getIntl();
    const what = intl.formatMessage(dialogs.project_actions_create_file_what, {
      path: p,
    });
    if (!(await ensure_project_running(this.project_id, what))) {
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
    try {
      await this.projectApi().editor.newFile(p);
    } catch (err) {
      this.setState({
        file_creation_error: `${err}`,
      });
      return;
    }
    this.log({ event: "file_action", action: "created", files: [p] });
    if (opts.switch_over) {
      this.open_file({
        path: p,
        // so opens on current compute server, and because switch_over is only something
        // we do when user is explicitly opening the file
        explicit: true,
        compute_server_id,
      });
    } else {
      this.fetch_directory_listing();
    }
  };

  private new_file_from_web = async (
    url: string,
    current_path: string,
  ): Promise<void> => {
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
  };

  /*
   * Actions for PUBLIC PATHS
   */
  set_public_path = async (
    path,
    opts: {
      description?: string;
      unlisted?: boolean;
      license?: string;
      disabled?: boolean;
      authenticated?: boolean;
      site_license_id?: string | null;
      jupyter_api?: boolean;
      redirect?: string;
    },
  ) => {
    if (
      this.checkForSandboxError(
        "Publishing files is not allowed in a sandbox project.   Create your own private project in the Projects tab in the upper left.",
      )
    ) {
      console.warn("set_public_path: sandbox");
      return;
    }

    const store = this.get_store();
    if (!store) {
      console.warn("set_public_path: no store");
      return;
    }

    const project_id = this.project_id;
    const id = client_db.sha1(project_id, path);

    const projects_store = redux.getStore("projects");
    const dflt_compute_img = await redux
      .getStore("customize")
      .getDefaultComputeImage();

    const compute_image: string =
      projects_store.getIn(["project_map", project_id, "compute_image"]) ??
      dflt_compute_img;

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
    if (obj == null) {
      // make typescript happy
      console.warn("set_public_path: BUG -- obj can't be null");
      return;
    }

    // not allowed to write these back
    obj = obj.delete("last_saved");
    obj = obj.delete("counter");

    obj = obj.set("last_edited", now);
    obj = obj.set("compute_image", compute_image);

    for (const k in opts) {
      if (opts[k] !== undefined) {
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
          } else if (k === "site_license_id" && will_change) {
            log = true;
          } else if (k === "jupyter_api" && will_change) {
            log = true;
          } else if (k === "redirect" && will_change) {
            log = true;
          }
        }
        obj = obj.set(k, opts[k]);
      }
    }
    if (obj.get("disabled") && obj.get("name")) {
      // clear the name when disabling a share -- see https://github.com/sagemathinc/cocalc/issues/6172
      obj = obj.set("name", "");
    }

    table.set(obj);

    if (log) {
      // can't just change always since we frequently update last_edited to get the share to get copied over.
      this.log({
        event: "public_path",
        path: path + ((await this.isdir(path)) ? "/" : ""),
        disabled: !!obj.get("disabled"),
        unlisted: !!obj.get("unlisted"),
        authenticated: !!obj.get("authenticated"),
        site_license_id: obj.get("site_license_id")?.slice(-8),
        jupyter_api: obj.get("jupyter_api"),
        redirect: obj.get("redirect"),
      });
    }
  };

  // Make a database query to set the name of a
  // public path.  Because this can error due to
  // an invalid name it's good to do this rather than
  // changing the public_paths table.  This function
  // will throw an exception if anything goes wrong setting
  // the name.
  setPublicPathName = async (path: string, name: string): Promise<void> => {
    const id = client_db.sha1(this.project_id, path);
    const query = {
      public_paths: { project_id: this.project_id, path, name, id },
    };
    await webapp_client.async_query({ query });
  };

  /*
   * Actions for Project Search
   */

  toggle_search_checkbox_subdirectories = () => {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const subdirectories = !store.get("subdirectories");
    this.setState({ subdirectories });
    redux
      .getActions("account")
      ?.set_other_settings("find_subdirectories", subdirectories);
  };

  toggle_search_checkbox_case_sensitive = () => {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const case_sensitive = !store.get("case_sensitive");
    this.setState({ case_sensitive });
    redux
      .getActions("account")
      ?.set_other_settings("find_case_sensitive", case_sensitive);
  };

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
          filter: `${filename.toLowerCase()} ${context.toLowerCase()}`,
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

  search = () => {
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
    this.setState({
      search_results: undefined,
      search_error: undefined,
      most_recent_search: query,
      most_recent_path: store.get("current_path"),
      too_many_results: false,
    });
    const path = store.get("current_path");

    track("search", {
      project_id: this.project_id,
      path,
      query,
      neural_search: store.get("neural_search"),
      subdirectories: store.get("subdirectories"),
      hidden_files: store.get("hidden_files"),
      git_grep: store.get("git_grep"),
    });

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
      command: cmd,
    });

    const compute_server_id = this.getComputeServerId();
    webapp_client.exec({
      project_id: this.project_id,
      command: cmd + " | cut -c 1-256", // truncate horizontal line length (imagine a binary file that is one very long line)
      timeout: 20, // how long grep runs on client
      max_output,
      bash: true,
      err_on_exit: true,
      compute_server_id,
      filesystem: true,
      path: store.get("current_path"),
      cb: (err, output) => {
        this.process_search_results(err, output, max_results, max_output, cmd);
      },
    });
  };

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
    fragmentId?: FragmentId,
  ): Promise<void> {
    const segments = target.split("/");
    const full_path = segments.slice(1).join("/");
    const parent_path = segments.slice(1, segments.length - 1).join("/");
    const last = segments.slice(-1).join();
    const main_segment = segments[0] as FixedTab | "home";
    switch (main_segment) {
      case "active":
        console.warn(
          "there is no 'active files' page – those are the tabs in the projec",
        );
        return;

      case "files":
        if (target.endsWith("/") || full_path === "") {
          //if DEBUG then console.log("ProjectStore::load_target → open_directory", parent_path)
          this.open_directory(parent_path, change_history);
          return;
        }
        const store = this.get_store();
        if (store == null) {
          return; // project closed already
        }
        // We check whether the path is a directory or not, first by checking if
        // we have a recent directory listing in our cache, and if not, by calling
        // isdir, which is a single exec.
        let isdir;
        let { item, err } = store.get_item_in_path(last, parent_path);
        if (item == null || err) {
          try {
            isdir = await webapp_client.project_client.isdir({
              project_id: this.project_id,
              path: normalize(full_path),
            });
          } catch (err) {
            // TODO: e.g., project is not running?
            // I've seen this, e.g., when trying to open a file when not running, and it just
            // gets retried and works.
            console.log(`Error opening '${target}' -- ${err}`);
            return;
          }
        } else {
          isdir = item.get("isdir");
        }
        if (isdir) {
          this.open_directory(full_path, change_history);
        } else {
          this.open_file({
            path: full_path,
            foreground,
            foreground_project: foreground,
            ignore_kiosk,
            change_history,
            fragmentId,
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

      case "home":
        this.set_active_tab("home", { change_history: change_history });
        break;

      case "settings":
        this.set_active_tab("settings", { change_history: change_history });
        break;

      case "servers":
        this.set_active_tab("servers", { change_history: change_history });
        break;

      case "search":
        this.set_current_path(full_path);
        this.set_active_tab("search", { change_history: change_history });
        break;

      case "info":
        this.set_active_tab("info", { change_history: change_history });
        break;

      case "users":
        this.set_active_tab("users", {
          change_history: change_history,
        });
        break;

      case "upgrades":
        this.set_active_tab("upgrades", { change_history: change_history });
        break;

      default:
        misc.unreachable(main_segment);
        console.warn(`project/load_target: don't know segment ${main_segment}`);
    }
  }

  set_compute_image = async (compute_image: string): Promise<void> => {
    const projects_store = this.redux.getStore("projects");
    const previous: string =
      projects_store.getIn(["project_map", this.project_id, "compute_image"]) ??
      "";
    if (previous == compute_image) {
      // it is already set to the goal, so nothing to do.
      // See https://github.com/sagemathinc/cocalc/issues/7304
      return;
    }

    await client_query({
      query: {
        projects: {
          project_id: this.project_id,
          compute_image,
        },
      },
    });

    // if the above is successful, we log it
    const event: SoftwareEnvironmentEvent = {
      event: "software_environment",
      previous,
      next: compute_image,
    };
    this.log(event);
  };

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
    // Dear future dev: don't delete the project_log table
    // https://github.com/sagemathinc/cocalc/issues/6765
    store.init_table("project_log_all");
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
    Fragment.clear();
    const store = this.get_store();
    if (store == undefined) return; // project closed
    const a = store.get("active_project_tab");
    if (!misc.startswith(a, "editor-")) return;
    this.hide_file(misc.tab_to_path(a));
  }

  async ensure_directory_exists(
    path: string,
    compute_server_id?: number,
  ): Promise<void> {
    compute_server_id = this.getComputeServerId(compute_server_id);
    await webapp_client.exec({
      project_id: this.project_id,
      command: "mkdir",
      args: ["-p", path],
      compute_server_id,
      filesystem: true,
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
      compute_server_id,
      filesystem: true,
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
    await this.wait_until_no_modals();
    let response: "ok" | "cancel" = "cancel";
    const modal = fromJS({
      title,
      content,
      onOk: () => (response = "ok"),
      onCancel: () => (response = "cancel"),
    }) as any;
    this.modal = modal;
    this.setState({ modal });
    await this.wait_until_no_modals();
    return response;
  }

  public async wait_until_no_modals(): Promise<void> {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const noModal = () => {
      return this.modal == null && !store.get("modal");
    };

    if (noModal()) {
      return;
    }
    await store.async_wait({
      until: noModal,
      timeout: 99999,
    });
  }

  public show_public_config(path: string): void {
    this.set_current_path(misc.path_split(path).head);
    this.set_all_files_unchecked();
    this.set_file_checked(path, true);
    this.set_file_action("share");
  }

  public toggleActionButtons() {
    this.setState({
      hideActionButtons: !this.get_store()?.get("hideActionButtons"),
    });
  }

  public clear_just_closed_files() {
    this.setState({
      just_closed_files: List([]),
    });
  }

  getComputeServerId = (id?: number): number => {
    const store = this.get_store();
    return id ?? store?.get("compute_server_id") ?? 0;
  };

  showComputeServers = () => {
    this.setServerTab("compute-servers");
  };

  createComputeServerDialog = () => {
    this.setState({ create_compute_server: true });
    this.showComputeServers();
  };

  setServerTab = (name: TabName) => {
    setServerTab(this.project_id, name);
    this.set_active_tab("servers", {
      change_history: true,
    });
  };

  // time = 0 to undelete
  setRecentlyDeleted = (path: string, time: number) => {
    const store = this.get_store();
    if (store == null) return;
    let recentlyDeletedPaths = store.get("recentlyDeletedPaths") ?? Map();
    if (time == (recentlyDeletedPaths.get(path) ?? 0)) {
      // already done
      return;
    }
    recentlyDeletedPaths = recentlyDeletedPaths.set(path, time);
    this.setState({ recentlyDeletedPaths });
  };

  setNotDeleted = (path: string) => {
    const store = this.get_store();
    if (store == null) return;
    this.setRecentlyDeleted(path, 0);
    (async () => {
      try {
        const o = await webapp_client.conat_client.openFiles(this.project_id);
        o.setNotDeleted(path);
      } catch (err) {
        console.log("WARNING: issue undeleting file", err);
      }
    })();
  };

  private initProjectStatus = async () => {
    this.projectStatusSub = await getProjectStatus({
      project_id: this.project_id,
      compute_server_id: 0,
    });
    for await (const mesg of this.projectStatusSub) {
      const status = mesg.data;
      this.setState({ status });
    }
  };

  private initComputeServersTable = () => {
    // table of information about all the compute servers in this project
    computeServers.init(this.project_id);
  };

  private closeComputeServerTable = () => {
    computeServers.close(this.project_id);
  };

  private initComputeServerManager = () => {
    // console.log("initComputeServerManager");
    if (this.state == "closed") {
      return;
    }
    // table mapping paths to the id of the compute server it is hosted on
    this.computeServerManager = computeServerManager({
      project_id: this.project_id,
    });
    this.computeServerManager.once("connected", () => {
      if (this.state == "closed" || this.computeServerManager == null) {
        return;
      }
      const compute_server_ids = {
        ...this.computeServerManager.getAll(),
      } as any;
      for (const path in compute_server_ids) {
        compute_server_ids[path] = compute_server_ids[path].id;
      }
      this.setState({ compute_server_ids });
    });
    this.computeServerManager.on(
      "change",
      this.handleComputeServerManagerChange,
    );
  };

  private closeComputeServerManager = () => {
    // console.log("closeComputeServerManager");
    if (this.computeServerManager == null) {
      return;
    }
    this.computeServerManager.removeListener(
      "change",
      this.handleComputeServerManagerChange,
    );
    this.computeServerManager.close();
    delete this.computeServerManager;
  };

  computeServers = () => {
    return this.computeServerManager;
  };

  private handleComputeServerManagerChange = ({ path, id }) => {
    const store = this.get_store();
    if (store == undefined) return;
    const compute_servers_ids: any =
      store.get("compute_server_ids") ?? fromJS({});
    this.setState({ compute_server_ids: compute_servers_ids.set(path, id) });
  };

  // undefined if not specified or not known
  getComputeServerIdForFile = ({
    path,
  }: {
    path: string;
  }): number | undefined => {
    if (this.computeServerManager?.state != "connected") {
      // don't know anything yet.
      // TODO: maybe we should change this to be async and guarantee answer known -- not sure.
      return;
    }
    return this.computeServerManager?.get(canonicalPath(path));
  };

  // In case of confirmation, returns true on success or false if user says "no"
  // Also, no matter what, we NEVER explicitly request confirmation if the
  // file doesn't involve backend state that could be reset, e.g., we basically
  // only confirm for terminals and jupyter notebooks.
  setComputeServerIdForFile = async ({
    path,
    compute_server_id,
    confirm,
  }: {
    path: string;
    compute_server_id?: number;
    confirm?: boolean;
  }): Promise<boolean> => {
    if (confirm) {
      if (!path.endsWith(".term") && !path.endsWith(".ipynb")) {
        // ONLY confirm when there is some danger is loss of state.  Otherwise,
        // this is very annoying.
        confirm = false;
      }
    }
    const selectedComputeServerId = this.getComputeServerId(compute_server_id);
    const computeServerAssociations =
      webapp_client.project_client.computeServers(this.project_id);
    // this is what is currently configured:
    const currentId =
      (await computeServerAssociations.getServerIdForPath(path)) ?? 0;
    if (currentId == selectedComputeServerId) {
      // no need to set anything since we have what we want already
      return true;
    }
    if (confirm) {
      // (currently we only confirm this jupyter and terminals, which are
      // the only supported file types with backend state).
      if (
        !(await redux.getActions("page").popconfirm(
          modalParams({
            current: currentId,
            target: selectedComputeServerId,
            path,
          }),
        ))
      ) {
        return false;
      }
    }
    // Explicitly set the compute server id to what we want.
    computeServerAssociations.connectComputeServerToPath({
      id: selectedComputeServerId,
      path,
    });
    // Now we save: why?
    // Because we need to be sure the backend actually knows we want to use the compute
    // server for the file before opening it; otherwise, it'll first get opened
    // in the project, then later on the compute server, which is potentially VERY
    // disconcerting and annoying, especially if the file doesn't exist.  It does
    // work without doing this (because our design is robust to switching compute servers
    // at any time), but it ends up with a blank file for a moment, and lots of empty files
    // being created.
    await computeServerAssociations.save();
    return true;
  };

  projectApi = (opts?) => {
    return webapp_client.conat_client.projectApi({
      ...opts,
      project_id: this.project_id,
    });
  };
}
