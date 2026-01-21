/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// TODO: we should refactor our code to not have these window/document references here.
declare let window, document;

import { callback } from "awaiting";
import { List, Map, fromJS, Set as immutableSet } from "immutable";
import { isEqual, throttle } from "lodash";
import { basename, dirname, join } from "path";
import { defineMessage } from "react-intl";
import type { IconName } from "@cocalc/frontend/components/icon";
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
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { local_storage } from "@cocalc/frontend/editor-local-storage";
import {
  query as client_query,
  exec,
} from "@cocalc/frontend/frame-editors/generic/client";
import { set_url } from "@cocalc/frontend/history";
import {
  download_file,
  open_new_tab,
  open_popup_window,
} from "@cocalc/frontend/misc";
import Fragment, { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import * as project_file from "@cocalc/frontend/project-file";
import {
  ProjectEvent,
  SoftwareEnvironmentEvent,
} from "@cocalc/frontend/project/history/types";
import {
  OpenFileOpts,
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
import { getValidActivityBarOption } from "@cocalc/frontend/project/page/activity-bar";
import { ACTIVITY_BAR_KEY } from "@cocalc/frontend/project/page/activity-bar-consts";
import { ensure_project_running } from "@cocalc/frontend/project/project-start-warning";
import { transform_get_url } from "@cocalc/frontend/project/transform-get-url";
import {
  NewFilenames,
  download_href,
  normalize,
  url_href,
} from "@cocalc/frontend/project/utils";
import { API } from "@cocalc/frontend/project/websocket/api";
import {
  Configuration,
  ConfigurationAspect,
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
import { once, retry_until_success, until } from "@cocalc/util/async-utils";
import { DEFAULT_NEW_FILENAMES, NEW_FILENAMES } from "@cocalc/util/db-schema";
import * as misc from "@cocalc/util/misc";
import { reduxNameToProjectId } from "@cocalc/util/redux/name";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { client_db } from "@cocalc/util/schema";
import { type FilesystemClient } from "@cocalc/conat/files/fs";
import {
  getCacheId,
  getFiles,
  type Files,
} from "@cocalc/frontend/project/listing/use-files";
import { search } from "@cocalc/frontend/project/search/run";
import { type CopyOptions } from "@cocalc/conat/files/fs";
import { CopyOpsManager } from "@cocalc/frontend/project/copy-ops";
import { BackupOpsManager } from "@cocalc/frontend/project/backup-ops";
import { RestoreOpsManager } from "@cocalc/frontend/project/restore-ops";
import { MoveOpsManager } from "@cocalc/frontend/project/move-ops";
import { StartOpsManager } from "@cocalc/frontend/project/start-ops";
import { getFileTemplate } from "./project/templates";
import { SNAPSHOTS } from "@cocalc/util/consts/snapshots";
import {
  DEFAULT_SNAPSHOT_COUNTS,
  DEFAULT_BACKUP_COUNTS,
} from "@cocalc/util/consts/snapshots";
import { getSearch } from "@cocalc/frontend/project/explorer/config";
import dust from "@cocalc/frontend/project/disk-usage/dust";
import { EditorLoadError } from "./file-editors-error";
import { lite } from "@cocalc/frontend/lite";

const { defaults, required } = misc;

const BAD_FILENAME_CHARACTERS = "\\";
const BAD_LATEX_FILENAME_CHARACTERS = '\'"()"~%$';
const BANNED_FILE_TYPES = new Set(["doc", "docx", "pdf", "sws"]);

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
      redirect: null,
    },
  },
};

const must_define = function (redux) {
  if (redux == null) {
    throw Error(
      "you must explicitly pass a redux object into each function in project_store",
    );
  }
};

export const FILE_ACTIONS = {
  compress: {
    name: defineMessage({
      id: "file_actions.compress.name",
      defaultMessage: "Compress",
      description: "Compress a file",
    }),
    icon: "compress" as IconName,
    allows_multiple_files: true,
    hideFlyout: false,
  },
  delete: {
    name: defineMessage({
      id: "file_actions.delete.name",
      defaultMessage: "Delete",
      description: "Delete a file",
    }),
    icon: "trash" as IconName,
    allows_multiple_files: true,
    hideFlyout: false,
  },
  rename: {
    name: defineMessage({
      id: "file_actions.rename.name",
      defaultMessage: "Rename",
      description: "Rename a file",
    }),
    icon: "swap" as IconName,
    allows_multiple_files: false,
    hideFlyout: false,
  },
  duplicate: {
    name: defineMessage({
      id: "file_actions.duplicate.name",
      defaultMessage: "Duplicate",
      description: "Duplicate a file",
    }),
    icon: "clone" as IconName,
    allows_multiple_files: false,
    hideFlyout: false,
  },
  move: {
    name: defineMessage({
      id: "file_actions.move.name",
      defaultMessage: "Move",
      description: "Move a file",
    }),
    icon: "move" as IconName,
    allows_multiple_files: true,
    hideFlyout: false,
  },
  copy: {
    name: defineMessage({
      id: "file_actions.copy.name",
      defaultMessage: "Copy",
      description: "Copy a file",
    }),
    icon: "files" as IconName,
    allows_multiple_files: true,
    hideFlyout: false,
  },
  share: {
    name: defineMessage({
      id: "file_actions.publish.name",
      defaultMessage: "Publish",
      description: "Publish a file",
    }),
    icon: "share-square" as IconName,
    allows_multiple_files: false,
    hideFlyout: false,
  },
  download: {
    name: defineMessage({
      id: "file_actions.download.name",
      defaultMessage: "Download",
      description: "Download a file",
    }),
    icon: "cloud-download" as IconName,
    allows_multiple_files: true,
    hideFlyout: false,
  },
  upload: {
    name: defineMessage({
      id: "file_actions.upload.name",
      defaultMessage: "Upload",
      description: "Upload a file",
    }),
    icon: "upload" as IconName,
    allows_multiple_files: false,
    hideFlyout: true,
  },
  create: {
    name: defineMessage({
      id: "file_actions.create.name",
      defaultMessage: "Create",
      description: "Create a file",
    }),
    icon: "plus-circle" as IconName,
    allows_multiple_files: false,
    hideFlyout: true,
  },
} as const;

export type FileAction = keyof typeof FILE_ACTIONS;

export class ProjectActions extends Actions<ProjectStoreState> {
  public state: "ready" | "closed" = "ready";
  public project_id: string;
  private _last_history_state: string;
  private _activity_indicator_timers: { [key: string]: number } = {};
  private _init_done = false;
  private new_filename_generator = new NewFilenames("", false);
  private modal?: ModalInfo;

  // these are all potentially expensive
  public open_files?: OpenFiles;
  private projectStatusSub?;
  private copyOpsManager: CopyOpsManager;
  private backupOpsManager: BackupOpsManager;
  private restoreOpsManager: RestoreOpsManager;
  private startOpsManager: StartOpsManager;
  private moveOpsManager: MoveOpsManager;

  constructor(name, b) {
    super(name, b);
    this.project_id = reduxNameToProjectId(name);
    this.open_files = new OpenFiles(this);
    this.copyOpsManager = new CopyOpsManager({
      project_id: this.project_id,
      setState: (state) => this.setState(state),
      isClosed: () => this.isClosed(),
      listLro: (opts) => webapp_client.conat_client.hub.lro.list(opts),
      getLroStream: (opts) => webapp_client.conat_client.lroStream(opts),
      dismissLro: (opts) => webapp_client.conat_client.hub.lro.dismiss(opts),
      log: (message, err) => console.warn(message, err),
    });
    this.backupOpsManager = new BackupOpsManager({
      project_id: this.project_id,
      setState: (state) => this.setState(state),
      isClosed: () => this.isClosed(),
      listLro: (opts) => webapp_client.conat_client.hub.lro.list(opts),
      getLroStream: (opts) => webapp_client.conat_client.lroStream(opts),
      dismissLro: (opts) => webapp_client.conat_client.hub.lro.dismiss(opts),
      log: (message, err) => console.warn(message, err),
    });
    this.restoreOpsManager = new RestoreOpsManager({
      project_id: this.project_id,
      setState: (state) => this.setState(state),
      isClosed: () => this.isClosed(),
      listLro: (opts) => webapp_client.conat_client.hub.lro.list(opts),
      getLroStream: (opts) => webapp_client.conat_client.lroStream(opts),
      dismissLro: (opts) => webapp_client.conat_client.hub.lro.dismiss(opts),
      log: (message, err) => console.warn(message, err),
    });
    this.startOpsManager = new StartOpsManager({
      project_id: this.project_id,
      setState: (state) => this.setState(state),
      isClosed: () => this.isClosed(),
      listLro: (opts) => webapp_client.conat_client.hub.lro.list(opts),
      getLroStream: (opts) => webapp_client.conat_client.lroStream(opts),
      dismissLro: (opts) => webapp_client.conat_client.hub.lro.dismiss(opts),
      log: (message, err) => console.warn(message, err),
    });
    this.moveOpsManager = new MoveOpsManager({
      project_id: this.project_id,
      setState: (state) => this.setState(state),
      isClosed: () => this.isClosed(),
      listLro: (opts) => webapp_client.conat_client.hub.lro.list(opts),
      getLroStream: (opts) => webapp_client.conat_client.lroStream(opts),
      dismissLro: (opts) => webapp_client.conat_client.hub.lro.dismiss(opts),
      log: (message, err) => console.warn(message, err),
    });
    // console.log("create project actions", this.project_id);
    // console.trace("create project actions", this.project_id)
    this.expensiveLoop();
  }

  // COST -- there's a lot of code all over that may create project actions,
  // e.g., when configuring a course with 150 students, then 150 project actions
  // get created to do various operations.   The big use of project actions
  // though is when an actual tab is open in the UI with projects.
  // So we put actions in two states: 'cheap' and 'expensive'.
  // In the expensive state, there can be extra changefeeds,
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

  // The expensive part of the actions should NOT exist if and only if
  // the reference count is 0 *AND* the tab is closed.
  private referenceCount = 0;

  incrementReferenceCount = () => {
    this.referenceCount++;
    this.initExpensive();
  };

  decrementReferenceCount = () => {
    if (this.referenceCount <= 0) {
      console.warn(
        "BUG: attempt to decrement project actions reference count below 0",
      );
      return;
    }
    this.referenceCount--;
    if (this.referenceCount <= 0 && !this.isTabOpened()) {
      this.closeExpensive();
    }
  };

  private expensiveLoop = async () => {
    while (this.state != "closed") {
      if (this.isTabOpened() || this.referenceCount > 0) {
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
    this.initProjectStatus();
    this.copyOpsManager.init();
    this.backupOpsManager.init();
    this.restoreOpsManager.init();
    this.startOpsManager.init();
    this.moveOpsManager.init();
    this.initSnapshots();
    this.initBackups();
    const store = this.get_store();
    store?.init_table?.("public_paths");
  };

  private closeExpensive = () => {
    if (!this.initialized) return;
    // console.log("closeExpensive", this.project_id);
    this.initialized = false;
    redux.removeProjectReferences(this.project_id);
    this.copyOpsManager.close();
    this.backupOpsManager.close();
    this.restoreOpsManager.close();
    this.startOpsManager.close();
    this.moveOpsManager.close();
    this.projectStatusSub?.close();
    delete this.projectStatusSub;
    must_define(this.redux);
    this.close_all_files();
    for (const table in QUERIES) {
      this.remove_table(table);
    }

    const store = this.get_store();
    store?.close_all_tables();
  };

  public async api(): Promise<API> {
    return await webapp_client.project_client.api(this.project_id);
  }

  trackStartOp = (op: {
    op_id?: string;
    scope_type?: "project" | "account" | "host" | "hub";
    scope_id?: string;
  }) => {
    this.startOpsManager.track(op);
  };

  trackMoveOp = (op: {
    op_id?: string;
    scope_type?: "project" | "account" | "host" | "hub";
    scope_id?: string;
  }) => {
    this.moveOpsManager.track(op);
  };

  trackBackupOp = (op: {
    op_id?: string;
    scope_type?: "project" | "account" | "host" | "hub";
    scope_id?: string;
  }) => {
    this.backupOpsManager.track(op);
  };

  trackRestoreOp = (op: {
    op_id?: string;
    scope_type?: "project" | "account" | "host" | "hub";
    scope_id?: string;
  }) => {
    this.restoreOpsManager.track(op);
  };

  dismissMoveLro = (op_id?: string) => {
    this.moveOpsManager.dismiss(op_id);
  };

  isClosed = () => this.state == "closed";

  destroy = (): void => {
    // console.log("destroy project actions", this.project_id);
    if (this.state == "closed") {
      return;
    }
    this.closeExpensive();
    this.open_files?.close();
    delete this.open_files;
    this.state = "closed";
    this.filesystem = undefined;
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
      await webapp_client.project_client.touch_project(this.project_id);
    } catch (err) {
      // nonfatal.
      console.warn(`unable to touch ${this.project_id} -- ${err}`);
    }
  };

  ensureProjectIsOpen = async () => {
    const s = this.redux.getStore("projects");
    if (!s.is_project_open(this.project_id)) {
      this.redux.getActions("projects").open_project({
        project_id: this.project_id,
        switch_to: true,
      });
      await s.waitUntilProjectIsOpen(this.project_id, 30);
    }
  };

  get_store = (): ProjectStore | undefined => {
    if (this.redux.hasStore(this.name)) {
      return this.redux.getStore<ProjectStoreState, ProjectStore>(this.name);
    } else {
      return undefined;
    }
  };

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
        const actBar = account_store?.getIn([
          "other_settings",
          ACTIVITY_BAR_KEY,
        ]);
        const flyoutsDefault = getValidActivityBarOption(actBar) === "flyout";
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
    this.close_file(path);
  }

  // Expects one of ['files', 'new', 'log', 'search', 'settings']
  //            or a file_redux_name
  // Pushes to browser history
  // Updates the URL
  set_active_tab = (
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
  ): void => {
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

        const info = store.get("open_files").getIn([path, "component"]) as any;
        if (info == null) {
          // shouldn't happen...
          return;
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
            try {
              const { name, Editor } = await this.init_file_react_redux(
                path,
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
            } catch (err) {
              // Error already reported to user by alert_message in file-editors.ts
              // Show error component in the editor area
              if (this.open_files == null) return;
              const error = err as Error;
              info.Editor = () =>
                require("react").createElement(EditorLoadError, {
                  path,
                  error,
                });
              this.open_files.set(path, "component", { ...info });
              if (!opts.noFocus) {
                this.show_file(path);
              }
              console.debug(
                `Editor initialization failed for ${path}, error already shown to user`,
              );
            }
          })();
        } else {
          if (!opts.noFocus) {
            this.show_file(path);
          }
        }
    }
    this.setState(change);
  };

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

    project_file.save(opts.path, this.redux, this.project_id);
  }

  // Save all open files in this project
  save_all_files(): void {
    const s: any = this.redux.getStore("projects");
    if (!s.is_project_open(this.project_id)) {
      return; // nothing to do regarding save, since project isn't even open
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
      project_file.save(path, this.redux, this.project_id);
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
    if (this.state == "closed") return;
    await open_file(this, opts);
  };

  /* Initialize the redux store and react component for editing
     a particular file, if necessary.
  */
  initFileRedux = reuseInFlight(
    async (
      path: string,
      ext?: string, // use this extension even instead of path's extension.
    ): Promise<string | undefined> => {
      const cur = redux.getEditorActions(this.project_id, path);
      if (cur != null) {
        return cur.name;
      }
      // LAZY IMPORT, so that editors are only available
      // when you are going to use them.  Helps with code splitting.
      await import("./editors/register-all");

      // Initialize the file's store and actions
      const name = await project_file.initializeAsync(
        path,
        this.redux,
        this.project_id,
        undefined,
        ext,
      );
      return name;
    },
  );

  private init_file_react_redux = async (
    path: string,
    ext?: string,
  ): Promise<{ name: string | undefined; Editor: any }> => {
    const name = await this.initFileRedux(path, ext);

    // Make the Editor react component
    const Editor = await project_file.generateAsync(
      path,
      this.redux,
      this.project_id,
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
    actions?.programmatical_goto_line?.(line, cursor, focus);
  }

  // Called when a file tab is shown.
  private show_file(path): void {
    const a: any = redux.getEditorActions(this.project_id, path);
    a?.show?.();
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
    if (typeof a?.hide === "function") {
      a.hide();
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

  private touchActiveFileIfOnComputeServer = throttle(async (_path: string) => {
    void _path;
    return;
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
    file_paths.map((_obj, path) => {
      project_file.remove(path, this.redux, this.project_id);
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
    project_file.remove(path, this.redux, this.project_id);
    this.save_session();
  };

  // Makes this project the active project tab
  foreground_project = async (change_history = true) => {
    try {
      await this.ensureProjectIsOpen();
    } catch (err) {
      console.warn(
        "error putting project in the foreground: ",
        err,
        this.project_id,
      );
      return;
    }
    this.redux
      .getActions("projects")
      .foreground_project(this.project_id, change_history);
  };

  open_directory = async (path, change_history = true, show_files = true) => {
    path = normalize(path);
    try {
      await this.ensureProjectIsOpen();
    } catch (err) {
      console.warn(
        "error opening directory in project: ",
        err,
        this.project_id,
        path,
      );
      return;
    }
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
  };

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
      most_recent_file_click: undefined,
    });
  };

  set_file_search(search): void {
    this.setState({
      file_search: search,
      file_action: undefined,
      most_recent_file_click: undefined,
      create_file_alert: false,
    });
  }

  // Increases the selected file index by 1
  // undefined increments to 0
  increment_selected_file_index(): void {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const selected_index = store.get("selected_file_index") ?? 0;
    const numDisplayedFiles = store.get("numDisplayedFiles") ?? 0;
    if (selected_index + 1 < numDisplayedFiles) {
      this.setState({ selected_file_index: selected_index + 1 });
    }
  }

  // Decreases the selected file index by 1.
  // Guaranteed to never set below 0.
  // Does nothing when selected_file_index is undefined
  decrement_selected_file_index(): void {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const selected_index = store.get("selected_file_index") ?? 0;
    if (selected_index > 0) {
      this.setState({ selected_file_index: selected_index - 1 });
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
  set_selected_file_range(file: string, checked: boolean, listing): void {
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
      const names = listing.map(({ name }) =>
        misc.path_to_file(current_path, name),
      );
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
      file_action?: FileAction | undefined;
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
      file_action?: FileAction | undefined;
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
      file_action?: FileAction | undefined;
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
    });
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

  set_file_action = (action?: FileAction): void => {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    this.setState({ file_action: action });
  };

  showFileActionPanel = async ({
    path,
    action,
  }: {
    path: string;
    action:
      | FileAction
      | "open"
      | "open_recent"
      | "quit"
      | "close"
      | "new"
      | "create"
      | "upload";
  }) => {
    this.set_all_files_unchecked();
    if (action == "new" || action == "create") {
      // special case because it isn't a normal "file action panel",
      // but it is convenient to still support this.
      if (this.get_store()?.get("flyout") != "new") {
        this.toggleFlyout("new");
      }
      this.setState({
        default_filename: default_filename(
          misc.filename_extension(path),
          this.project_id,
        ),
      });
      return;
    }
    if (action == "upload") {
      this.set_active_tab("files");
      setTimeout(() => {
        // NOTE: I'm not proud of this, but right now our upload functionality
        // is based on not-very-react-ish library...
        $(".upload-button").click();
      }, 100);
      return;
    }
    if (action == "open") {
      if (this.get_store()?.get("flyout") != "files") {
        this.toggleFlyout("files");
      }
      return;
    }
    if (action == "open_recent") {
      if (this.get_store()?.get("flyout") != "log") {
        this.toggleFlyout("log");
      }
      return;
    }

    const path_splitted = misc.path_split(path);
    await this.open_directory(path_splitted.head);

    if (action == "quit") {
      // TODO: for jupyter and terminal at least, should also do more!
      this.close_tab(path);
      return;
    }
    if (action == "close") {
      this.close_tab(path);
      return;
    }
    this.set_file_checked(path, true);
    this.set_file_action(action);
  };

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

  private appendSlashToDirectoryPaths = async (
    paths: string[],
  ): Promise<string[]> => {
    const f = async (path: string) => {
      if (path.endsWith("/")) {
        return path;
      }
      const isDir = this.isDirViaCache(path);
      if (isDir === false) {
        return path;
      }
      if (isDir === true) {
        return path + "/";
      }
      if (await this.isDir(path)) {
        return path + "/";
      } else {
        return path;
      }
    };
    return await Promise.all(paths.map(f));
  };

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

  copyPaths = async ({
    src,
    dest,
    id,
    only_contents,
  }: {
    src: string[];
    dest: string;
    id?: string;
    only_contents?: boolean;
  }) => {
    const withSlashes = await this.appendSlashToDirectoryPaths(src);

    this.log({
      event: "file_action",
      action: "copied",
      files: withSlashes,
      count: src.length,
      dest: dest + (only_contents ? "" : "/"),
    });

    if (only_contents) {
      src = withSlashes;
    }

    // If files start with a -, make them interpretable by rsync (see https://github.com/sagemathinc/cocalc/issues/516)
    // Just prefix all of them, due to https://github.com/sagemathinc/cocalc/issues/4428 brining up yet another issue
    const add_leading_dash = function (src_path: string) {
      return `./${src_path}`;
    };

    // Ensure that src files are not interpreted as an option to rsync
    src = src.map(add_leading_dash);

    id ??= misc.uuid();
    this.set_activity({
      id,
      status: `Copying ${src.length} ${misc.plural(
        src.length,
        "file",
      )} to ${dest}`,
    });

    const fs = this.fs();
    try {
      await fs.cp(src, dest, { recursive: true, reflink: true });
      this._finish_exec(id)();
    } catch (err) {
      this._finish_exec(id)(`${err}`);
    }
  };

  // Copy 1 or more paths from one project to another (possibly the same) project.
  copyPathBetweenProjects = async (opts: {
    src: { project_id: string; path: string | string[] };
    dest: { project_id: string; path: string };
    options?: CopyOptions;
  }) => {
    const id = misc.uuid();
    const files =
      typeof opts.src.path == "string" ? [opts.src.path] : opts.src.path;
    this.set_activity({
      id,
      status: `Copying ${files.length} ${misc.plural(
        files.length,
        "path",
      )} to a project`,
    });
    let error: any = undefined;
    try {
      const resp =
        await webapp_client.project_client.copyPathBetweenProjects(opts);
      this.copyOpsManager.track(resp);
      const withSlashes = await this.appendSlashToDirectoryPaths(files);
      this.log({
        event: "file_action",
        action: "copied",
        dest: opts.dest.path,
        files: withSlashes,
        count: files.length,
        project: opts.dest.project_id,
      });
    } catch (err) {
      error = `${err}`;
    } finally {
      this.set_activity({ id, stop: "", error });
    }
  };

  renameFile = async ({
    src,
    dest,
  }: {
    src: string;
    dest: string;
  }): Promise<void> => {
    let error: any = undefined;
    const id = misc.uuid();
    const status = `Renaming ${src} to ${dest}`;
    this.set_activity({ id, status });
    try {
      const fs = this.fs();
      await fs.rename(src, dest);
      this.log({
        event: "file_action",
        action: "renamed",
        src,
        dest: dest + ((await this.isDir(dest)) ? "/" : ""),
      });
    } catch (err) {
      error = err;
    } finally {
      this.set_activity({ id, stop: "", error });
    }
  };

  // note: there is no need to explicitly close or await what is returned by
  // fs(...) since it's just a lightweight wrapper object to format appropriate RPC calls.
  private filesystem?: FilesystemClient;
  fs = (): FilesystemClient => {
    this.filesystem ??= webapp_client.conat_client
      .conat()
      .fs({ project_id: this.project_id });
    return this.filesystem;
  };

  dust = async (path: string) => {
    return await dust({ project_id: this.project_id, path });
  };

  // if available in cache, this returns the filenames in the current directory,
  // which is often useful, or null if they are not known. This is sync, so it
  // can't query the backend.  (Here Files is a map from path names to data about them.)
  get_filenames_in_current_dir = (): Files | null => {
    const store = this.get_store();
    if (store == undefined) {
      return null;
    }
    const path = store.get("current_path");
    if (path == null) {
      return null;
    }
    return this.getFilesCache(path);
  };

  getCacheId = () => {
    return getCacheId({
      project_id: this.project_id,
    });
  };

  private getFilesCache = (path: string): Files | null => {
    return getFiles({
      cacheId: this.getCacheId(),
      path: path == "." ? "" : path,
    });
  };

  // using listings cache, attempt to tell if path is a directory;
  // undefined if no data about path in the cache.
  isDirViaCache = (path: string): boolean | undefined => {
    if (!path) {
      return true;
    }
    const { head: dir, tail: base } = misc.path_split(path);
    const files = this.getFilesCache(dir);
    const data = files?.[base];
    if (data == null) {
      return undefined;
    } else {
      return !!data.isDir;
    }
  };

  // return true if exists and is a directory
  // error if doesn't exist or can't find out.
  // Use isDirViaCache for more of a fast hint.
  isDir = async (path: string): Promise<boolean> => {
    if (path == "") return true; // easy special case
    const stats = await this.fs().stat(path);
    return stats.isDirectory();
  };

  moveFiles = async ({
    src,
    dest,
  }: {
    src: string[];
    dest: string;
  }): Promise<void> => {
    const id = misc.uuid();
    const status = `Moving ${src.length} ${misc.plural(
      src.length,
      "file",
    )} to ${dest}`;
    this.set_activity({ id, status });
    let error: any = undefined;
    try {
      const fs = this.fs();
      await Promise.all(
        src.map(async (path) =>
          fs.move(path, join(dest, basename(path)), { overwrite: true }),
        ),
      );
      this.log({
        event: "file_action",
        action: "moved",
        files: src,
        dest: dest + "/" /* target is assumed to be a directory */,
      });
    } catch (err) {
      error = err;
    } finally {
      this.set_activity({ id, stop: "", error });
    }
  };

  deleteFiles = async ({
    paths,
  }: {
    paths: string[];
  }): Promise<void> => {
    if (paths.length == 0) {
      // nothing to do
      return;
    }
    const id = misc.uuid();
    let mesg;
    if (isEqual(paths, [".trash"])) {
      mesg = "the trash";
    } else if (paths.length === 1) {
      mesg = `${paths[0]}`;
    } else {
      mesg = `${paths.length} files`;
    }
    this.set_activity({ id, status: `Deleting ${mesg}...` });

    try {
      // delete any snapshots:
      const snapshots: string[] = [];
      const nonSnapshotPaths: string[] = [];
      for (const path of paths) {
        if (dirname(path) == SNAPSHOTS) {
          snapshots.push(basename(path));
        } else {
          nonSnapshotPaths.push(path);
        }
      }
      if (snapshots.length > 0) {
        for (const name of snapshots) {
          await webapp_client.conat_client.hub.projects.deleteSnapshot({
            project_id: this.project_id,
            name,
          });
        }
      }
      if (nonSnapshotPaths.length > 0) {
        const fs = this.fs();
        await fs.rm(nonSnapshotPaths, { force: true, recursive: true });
      }

      this.log({
        event: "file_action",
        action: "deleted",
        files: paths,
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
  };

  // remove all files in the given path (or subtree of that path)
  // for which filter(filename) returns true.
  // - path should be relative to HOME
  // - filname will also be relative to HOME and will end in a slash if it is a directory
  // Returns the deleted paths.
  deleteMatchingFiles = async ({
    path,
    filter,
    recursive,
  }: {
    path: string;
    filter: (path: string) => boolean;
    recursive?: boolean;
  }): Promise<string[]> => {
    const fs = this.fs();
    const options: string[] = ["-H", "-I"];
    if (!recursive) {
      options.push("-d", "1");
    }
    const { stdout } = await fs.fd(path, { options });
    const paths = Buffer.from(stdout)
      .toString()
      .split("\n")
      .slice(0, -1)
      .map((p) => join(path, p))
      .filter(filter);
    if (paths.length > 0) {
      await this.deleteFiles({ paths });
    }
    return paths;
  };

  download_file = async ({
    path,
    log = false,
    auto = true,
    print = false,
  }: {
    path: string;
    log?: boolean | string[];
    auto?: boolean;
    print?: boolean;
  }): Promise<void> => {
    let url;
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
      url = download_href(this.project_id, path);
      download_file(url);
    } else {
      url = url_href(this.project_id, path);
      const tab = open_new_tab(url);
      if (tab != null && print) {
        // "?" since there might be no print method -- could depend on browser API
        tab.print?.();
      }
    }
  };

  print_file = (opts): void => {
    opts.print = true;
    this.download_file(opts);
  };

  show_upload = (show): void => {
    this.setState({ show_upload: show });
  };

  // Compute the absolute path to the file with given name but with the
  // given extension added to the file (e.g., "md") if the file doesn't have
  // that extension.  Throws an Error if the path name is invalid.
  construct_absolute_path = (
    name: string,
    current_path?: string,
    ext?: string,
  ): string => {
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
  };

  createFolder = async ({
    name,
    current_path,
    switch_over = true,
  }: {
    name: string;
    current_path?: string;
    // Whether or not to switch to the new folder (default: true)
    switch_over?: boolean;
  }): Promise<void> => {
    const path = current_path ? join(current_path, name) : name;
    const fs = this.fs();
    try {
      await fs.mkdir(path, { recursive: true });
    } catch (err) {
      this.setState({ file_creation_error: `${err}` });
    }
    if (switch_over) {
      this.open_directory(path);
    }
    // Log directory creation to the event log.  / at end of path says it is a directory.
    this.log({ event: "file_action", action: "created", files: [path + "/"] });
  };

  createFile = async ({
    name,
    ext,
    current_path,
    switch_over = true,
  }: {
    name: string;
    ext?: string;
    current_path?: string;
    switch_over?: boolean;
  }) => {
    this.setState({ file_creation_error: undefined }); // clear any create file display state
    if ((name === ".." || name === ".") && ext == null) {
      this.setState({
        file_creation_error: "Cannot create a file named . or ..",
      });
      return;
    }
    if (misc.is_only_downloadable(name)) {
      this.new_file_from_web(name, current_path ?? "");
      return;
    }

    if (name[name.length - 1] === "/") {
      if (ext == null) {
        this.createFolder({
          name,
          current_path,
        });
        return;
      } else {
        name = name.slice(0, name.length - 1);
      }
    }

    let path = current_path ? join(current_path, name) : name;
    if (ext) {
      path += "." + ext;
    }
    ext = misc.filename_extension(path);

    if (BANNED_FILE_TYPES.has(ext)) {
      this.setState({
        file_creation_error: `Cannot create a file with the ${ext} extension`,
      });
      return;
    }
    if (ext === "tex") {
      const filename = misc.path_split(name).tail;
      for (const bad_char of BAD_LATEX_FILENAME_CHARACTERS) {
        if (filename.includes(bad_char)) {
          this.setState({
            file_creation_error: `Cannot use '${bad_char}' in a LaTeX filename '${filename}'`,
          });
          return;
        }
      }
    }
    const content = getFileTemplate(ext);
    await this.ensureContainingDirectoryExists(path);
    const fs = this.fs();
    try {
      await fs.writeFile(path, content);
    } catch (err) {
      this.setState({
        file_creation_error: `${err}`,
      });
      return;
    }
    this.log({ event: "file_action", action: "created", files: [path] });
    if (ext) {
      redux.getActions("account")?.addTag(`create-${ext}`);
    }
    if (switch_over) {
      this.open_file({
        path,
        // so opens immediately, since switch_over is only something
        // we do when user is explicitly opening the file
        explicit: true,
        foreground: true,
      });
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
      redirect?: string;
    },
  ) => {
    const store = this.get_store();
    if (!store) {
      console.warn("set_public_path: no store");
      return;
    }

    const project_id = this.project_id;
    const id = client_db.sha1(project_id, path);

    const projects_store = redux.getStore("projects");
    const defaultComputeImage = await redux
      .getStore("customize")
      .getDefaultComputeImage();

    const compute_image: string =
      projects_store.getIn(["project_map", project_id, "compute_image"]) ??
      defaultComputeImage;

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
        path: path + ((await this.isDir(path)) ? "/" : ""),
        disabled: !!obj.get("disabled"),
        unlisted: !!obj.get("unlisted"),
        authenticated: !!obj.get("authenticated"),
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
  load_target = async (
    target,
    foreground = true,
    ignore_kiosk = false,
    change_history = true,
    fragmentId?: FragmentId,
  ): Promise<void> => {
    const segments = target.split("/");
    const full_path = segments.slice(1).join("/");
    const parent_path = segments.slice(1, segments.length - 1).join("/");
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

        // We check whether the path is a directory or not:
        const isDir = await this.isDir(full_path);
        if (isDir) {
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

      default:
        misc.unreachable(main_segment);
        console.warn(`project/load_target: don't know segment ${main_segment}`);
    }
  };

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

  ensureContainingDirectoryExists = async (path: string) => {
    await this.ensureDirectoryExists(dirname(path));
  };

  ensureDirectoryExists = async (path: string): Promise<void> => {
    const v = this.getFilesCache(dirname(path));
    if (v?.[basename(path)]) {
      // already exists
      return;
    }
    // create it -- just make it and if it already exists, not an error
    // (this avoids race conditions and is the right way)
    const fs = this.fs();
    try {
      await fs.mkdir(path, { recursive: true });
    } catch (err) {
      if (err.code == "EEXISTS") {
        return;
      }
      throw err;
    }
  };

  /* NOTE!  Below we store the modal state *both* in a private
  variable *and* in the store.  The reason is because we need
  to know it immediately after it is set in order for
  wait_until_no_modals to work robustless, and setState can
  wait before changing the state.
  */
  clear_modal = (): void => {
    delete this.modal;
    this.setState({ modal: undefined });
  };

  show_modal = async ({
    title,
    content,
  }: {
    title: string;
    content: string;
  }): Promise<"ok" | "cancel"> => {
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
  };

  wait_until_no_modals = async (): Promise<void> => {
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
  };

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
    if (this.open_files != null) {
      this.open_files.set_closed_files(List([]));
      return;
    }
    this.setState({ just_closed_files: List([]) });
  }

  showComputeServers = () => {};

  createComputeServerDialog = () => {};

  setServerTab = (_name: string) => {
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
  };

  private initProjectStatus = async () => {
    try {
      this.projectStatusSub = await getProjectStatus({
        project_id: this.project_id,
      });
    } catch (err) {
      // happens if you open a project you are not a collab on
      console.warn(`unable to subscribe to project status updates: `, err);
      return;
    }
    for await (const mesg of this.projectStatusSub) {
      const status = mesg.data;
      this.setState({ status });
    }
  };

  projectApi = (opts?) => {
    return webapp_client.conat_client.projectApi({
      ...opts,
      project_id: this.project_id,
    });
  };

  private searchId = 0;
  search = async (opts?: { path?: string }) => {
    const store = this.get_store();
    if (!store) {
      return;
    }
    const searchId = ++this.searchId;
    const setState = (x) => {
      if (this.searchId != searchId) {
        // there's a newer search
        return;
      }
      this.setState(x);
    };
    const path = opts?.path ?? store.get("current_path");
    const options = getSearch({
      project_id: this.project_id,
      path,
    });
    try {
      await search({
        setState,
        fs: this.fs(),
        query: store.get("user_input").trim(),
        path,
        options,
      });
    } catch (err) {
      setState({ search_error: `${err}` });
    }
  };

  initSnapshots = reuseInFlight(async () => {
    await until(
      async () => {
        if (lite || this.isClosed()) return true;
        const store = redux.getStore("projects");
        if (store == null) {
          return false;
        }
        const project = store.getIn(["project_map", this.project_id]);
        if (project == null) {
          return false;
        }
        const counts =
          project.get("snapshots")?.toJS() ?? DEFAULT_SNAPSHOT_COUNTS;
        if (counts.disabled) {
          return false;
        }
        try {
          await webapp_client.conat_client.hub.projects.updateSnapshots({
            project_id: this.project_id,
            counts,
          });
        } catch (err) {
          console.warn(
            `WARNING: Issue updating snapshots of ${this.project_id}`,
            err,
            { counts },
          );
        }
        return false;
      },
      // every 15 minutes
      { min: 60 * 1000 * 15, max: 60 * 1000 * 15 },
    );
  });

  initBackups = reuseInFlight(async () => {
    await until(
      async () => {
        if (lite || this.isClosed()) return true;
        const store = redux.getStore("projects");
        if (store == null) {
          return false;
        }
        const project = store.getIn(["project_map", this.project_id]);
        if (project == null) {
          return false;
        }
        const counts = project.get("backups")?.toJS() ?? DEFAULT_BACKUP_COUNTS;
        if (counts.disabled) {
          return false;
        }
        try {
          await webapp_client.conat_client.hub.projects.updateBackups({
            project_id: this.project_id,
            counts,
          });
        } catch (err) {
          console.warn(
            `WARNING: Issue updating backups of ${this.project_id}`,
            err,
            { counts },
          );
        }
        return false;
      },
      // every hour - though usually make only one backup per day
      { min: 60 * 1000 * 60, max: 60 * 1000 * 60 },
    );
  });
}
