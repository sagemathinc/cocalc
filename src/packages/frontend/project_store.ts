/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import * as immutable from "immutable";
import {
  AppRedux,
  project_redux_name,
  redux,
  Store,
  Table,
  TypedMap,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { useMemo } from "react";
import { fileURL } from "@cocalc/frontend/lib/cocalc-urls";
import { remove } from "@cocalc/frontend/project-file";
import { ProjectLogMap } from "@cocalc/frontend/project/history/types";
import {
  FILE_ACTIONS,
  ProjectActions,
  QUERIES,
  type FileAction,
} from "@cocalc/frontend/project_actions";
import {
  Available as AvailableFeatures,
  isMainConfiguration,
  ProjectConfiguration,
} from "@cocalc/frontend/project_configuration";
import { containing_public_path, deep_copy } from "@cocalc/util/misc";
import { FixedTab } from "./project/page/file-tab";
import {
  FlyoutActiveMode,
  FlyoutLogDeduplicate,
  FlyoutLogMode,
} from "./project/page/flyouts/state";
import {
  FLYOUT_ACTIVE_DEFAULT_MODE,
  FLYOUT_LOG_DEFAULT_DEDUP,
  FLYOUT_LOG_DEFAULT_MODE,
  FLYOUT_LOG_FILTER_DEFAULT,
  FlyoutLogFilter,
} from "./project/page/flyouts/utils";
import { type PublicPath } from "@cocalc/util/db-schema/public-paths";
import { DirectoryListing } from "@cocalc/frontend/project/explorer/types";
export { FILE_ACTIONS as file_actions, type FileAction, ProjectActions };
import { SCHEMA, client_db } from "@cocalc/util/schema";
import type {
  FindBackupsState,
  FindFilesState,
  FindScopeMode,
  FindSnapshotsState,
} from "@cocalc/frontend/project/find/types";

export type ModalInfo = TypedMap<{
  title: string | React.JSX.Element;
  content: string | React.JSX.Element;
  onOk?: any;
  onCancel?: any;
}>;

export interface ProjectStoreState {
  // Shared
  current_path: string;
  history_path: string;
  open_files: immutable.Map<string, immutable.Map<string, any>>;
  open_files_order: immutable.List<string>;
  just_closed_files: immutable.List<string>;
  public_paths?: immutable.Map<string, TypedMap<PublicPath>>;

  show_upload: boolean;
  create_file_alert: boolean;
  configuration?: ProjectConfiguration;
  configuration_loading: boolean; // for UI feedback
  available_features?: TypedMap<AvailableFeatures>;
  show_custom_software_reset: boolean;

  // Project Page
  active_project_tab: string;
  flyout: FixedTab | null;
  flyout_log_mode: FlyoutLogMode;
  flyout_log_deduplicate: FlyoutLogDeduplicate;
  flyout_log_filter: immutable.List<FlyoutLogFilter>;
  flyout_active_mode: FlyoutActiveMode;

  // Project Files
  activity: any; // immutable,
  backup_ops?: immutable.Map<string, any>;
  restore_ops?: immutable.Map<string, any>;
  copy_ops?: immutable.Map<string, any>;
  start_lro?: immutable.Map<string, any>;
  move_lro?: immutable.Map<string, any>;
  open_snapshot_schedule?: boolean;
  open_backup_schedule?: boolean;
  open_create_snapshot?: boolean;
  open_create_backup?: boolean;
  file_action?: FileAction;
  starred_files?: immutable.List<string>; // paths to starred files (synced from conat)
  file_search?: string;
  show_hidden?: boolean;
  show_masked?: boolean;
  error?: string;
  checked_files: immutable.Set<string>;

  selected_file_index?: number; // Index on file listing to highlight starting at 0. undefined means none highlighted
  // the number of visible files in the listing for the current directory; this is needed
  // for cursor based navigation by the search bar. This is the number after hiding hidden files and search filtering.
  numDisplayedFiles?: number;

  new_name?: string;
  most_recent_file_click?: string;
  file_listing_scroll_top?: number;
  new_filename?: string;
  ext_selection?: string;
  // paths that were deleted
  recentlyDeletedPaths?: immutable.Map<string, number>;

  // Project Log
  project_log?: ProjectLogMap;
  project_log_all?: ProjectLogMap;
  search?: string;
  page?: number;

  // Project New
  default_filename?: string;
  file_creation_error?: string;
  downloading_file: boolean;

  // Project Find
  user_input: string;
  search_results?: any; // immutable.List,
  search_error?: string;
  too_many_results?: boolean;
  command?: string;
  most_recent_search?: string;
  most_recent_path: string;
  find_tab?: string;
  find_prefill?: {
    tab: string;
    query: string;
    scope_path?: string;
    submode?: string;
  };
  find_scope_mode?: FindScopeMode;
  find_scope_path?: string;
  find_scope_pinned?: boolean;
  find_scope_history?: string[];
  find_files_state?: FindFilesState;
  find_snapshots_state?: FindSnapshotsState;
  find_backups_state?: FindBackupsState;

  // Search page -- update this when params change
  search_page?: number;

  // Project Settings
  get_public_path_id?: (path: string) => any;

  // Project Info
  show_project_info_explanation?: boolean;

  // Project Status
  status?: immutable.Map<string, any>; // this is @cocalc/comm/project-status/types::ProjectStatus;

  other_settings: any;

  // Modal -- if modal is set to a string, display that string as a yes/no question.
  // if Yes, then run the on_modal_yes function (if given).
  modal?: ModalInfo;

  // whether to hide the action buttons.
  hideActionButtons?: boolean;

  // if true, show the explorer tour
  explorerTour?: boolean;

  // while true, explorer keyhandler will not be enabled
  disableExplorerKeyhandler?: boolean;

  // whe change this when any sort changes, so the UI can update
  active_file_sort?: number;

  // error controlling the state of a project, e.g., starting or stopping it.
  control_error?: string;
}

export class ProjectStore extends Store<ProjectStoreState> {
  public project_id: string;
  private previous_runstate: string | undefined;

  // Function to call to initialize one of the tables in this store.
  // This is purely an optimization, so project_log, project_log_all and public_paths
  // do not have to be initialized unless necessary.  The code
  // is a little awkward, since I didn't want to change things too
  // much while making this optimization.
  public init_table: (table_name: string) => void;
  public close_table: (table_name: string) => void;
  public close_all_tables: () => void;

  //  name = 'project-[project-id]' = name of the store
  //  redux = global redux object
  constructor(name: string, _redux) {
    super(name, _redux);
    this.project_id = name.slice("project-".length);
    this._projects_store_change = this._projects_store_change.bind(this);
    this.setup_selectors();
  }

  _init = (): void => {
    // If we are explicitly listed as a collaborator on this project,
    // watch for this to change, and if it does, close the project.
    // This avoids leaving it open after we are removed, which is confusing,
    // given that all permissions have vanished.
    const projects: any = this.redux.getStore("projects"); // may not be available; for example when testing
    // console.log("ProjectStore::_init project_map/project_id", this.project_id, projects.getIn(["project_map", this.project_id]));
    if (
      (projects != null
        ? projects.getIn(["project_map", this.project_id])
        : undefined) != null
    ) {
      // console.log('ProjectStore::_init projects.on("change", ... )');
      // only do this if we are on project in the first place!
      projects.on("change", this._projects_store_change);
    }
  };

  destroy = (): void => {
    const projects_store = this.redux.getStore("projects");
    if (projects_store !== undefined) {
      projects_store.removeListener("change", this._projects_store_change);
    }
    // close any open file tabs, properly cleaning up editor state:
    const open = this.get("open_files")?.toJS();
    if (open != null) {
      for (const path in open) {
        remove(path, redux, this.project_id);
      }
    }
  };

  // constructor binds this callback, such that "this.project_id" works!
  private _projects_store_change(state): void {
    const change = state.getIn(["project_map", this.project_id]);
    //const log = (...args) =>
    //  console.log("project_store/_projects_store_change", ...args);
    if (change == null) {
      // User has been removed from the project!
      (this.redux.getActions("page") as any).close_project_tab(this.project_id);
    } else {
      const new_state = change.getIn(["state", "state"]);
      //log(this.previous_runstate, "=>", new_state);
      // fire started or stopped when certain state transitions happen
      if (this.previous_runstate != null) {
        if (this.previous_runstate != "running" && new_state == "running") {
          this.emit("started");
        }
        if (this.previous_runstate == "running" && new_state != "running") {
          this.emit("stopped");
        }
      } else {
        // null → "running"
        if (new_state == "running") {
          this.emit("started");
        }
      }
      this.previous_runstate = new_state;
    }
  }

  getInitialState = (): ProjectStoreState => {
    return {
      // Shared
      current_path: "",
      history_path: "",
      open_files: immutable.Map<immutable.Map<string, any>>({}),
      open_files_order: immutable.List([]),
      just_closed_files: immutable.List([]),
      show_upload: false,
      create_file_alert: false,
      show_masked: true,
      configuration: undefined,
      configuration_loading: false, // for UI feedback
      show_custom_software_reset: false,

      // Project Page
      active_project_tab: "files",
      flyout: null,
      flyout_log_mode: FLYOUT_LOG_DEFAULT_MODE,
      flyout_log_deduplicate: FLYOUT_LOG_DEFAULT_DEDUP,
      flyout_active_mode: FLYOUT_ACTIVE_DEFAULT_MODE,
      flyout_log_filter: immutable.List(FLYOUT_LOG_FILTER_DEFAULT),

      // Project Files
      activity: undefined,
      backup_ops: undefined,
      restore_ops: undefined,
      copy_ops: undefined,
      start_lro: undefined,
      move_lro: undefined,
      checked_files: immutable.Set(),
      file_listing_scroll_top: undefined,

      // Project New
      downloading_file: false,

      // Project Find
      user_input: "",
      search_page: 0,
      most_recent_path: "",
      find_tab: "contents",
      find_prefill: undefined,

      // Project Settings
      other_settings: undefined,
    };
  };

  selectors = {
    other_settings: {
      fn: () => {
        return (this.redux.getStore("account") as any).get("other_settings");
      },
    },

    get_public_path_id: {
      fn: () => {
        const project_id = this.project_id;
        return function (path) {
          return SCHEMA.public_paths.user_query?.set?.fields.id(
            { project_id, path },
            client_db,
          );
        };
      },
    },
  };

  // Returns the cursor positions for the given project_id/path, if that
  // file is opened, and supports cursors and is either old (and ...) or
  // is in react and has store with a cursors key.
  get_users_cursors = (path, account_id) => {
    const store: any = redux.getEditorStore(this.project_id, path);
    return store?.get("cursors") && store.get("cursors").get(account_id);
  };

  is_file_open = (path) => {
    return this.getIn(["open_files", path]) != null;
  };

  fileURL = (path) => {
    return fileURL({
      project_id: this.project_id,
      path,
    });
  };

  // returns false, if this project isn't capable of opening a file with the given extension
  can_open_file_ext = async (
    ext: string,
    actions: ProjectActions,
  ): Promise<boolean> => {
    // to make sure we know about disabled file types
    const conf = await actions.init_configuration("main");
    // if we don't know anything; we're optimistic and skip this check
    if (conf == null) {
      return true;
    }
    if (!isMainConfiguration(conf)) {
      return true;
    }
    const disabled_ext = conf.disabled_ext;
    return !disabled_ext.includes(ext);
  };

  public has_file_been_viewed(path: string): boolean {
    // note that component is NOT an immutable.js object:
    return this.getIn(["open_files", path, "component"])?.Editor != null;
  }
}

// Returns set of paths that are public in the given
// listing, because they are in a public folder or are themselves public.
// This is used entirely to put an extra "public" label in the row of the file,
// when displaying it in a listing.
export function getPublicFiles(
  listing: DirectoryListing,
  public_paths: PublicPath[],
  current_path: string,
): Set<string> {
  if ((public_paths?.length ?? 0) == 0) {
    return new Set();
  }
  const paths = public_paths
    .filter(({ disabled }) => !disabled)
    .map(({ path }) => path);

  if (paths.length == 0) {
    return new Set();
  }

  const head = current_path ? current_path + "/" : "";
  if (containing_public_path(current_path, paths)) {
    // fast special case: *every* file is public
    return new Set(listing.map(({ name }) => name));
  }

  // maybe some files are public?
  const X = new Set<string>();
  for (const file of listing) {
    const full = head + file.name;
    if (containing_public_path(full, paths) != null) {
      X.add(file.name);
    }
  }
  return X;
}

export function init(project_id: string, redux: AppRedux): ProjectStore {
  const name = project_redux_name(project_id);
  if (redux.hasStore(name)) {
    const store: ProjectStore | undefined = redux.getProjectStore(name);
    // this makes TS happy. we already check that it exists due to "hasStore()"
    if (store != null) return store;
  }

  // Initialize everything
  const store: ProjectStore = redux.createStore<
    ProjectStoreState,
    ProjectStore
  >(name, ProjectStore);
  const actions = redux.createActions<ProjectStoreState, ProjectActions>(
    name,
    ProjectActions,
  );
  store.project_id = project_id;
  actions.project_id = project_id; // so actions can assume this is available on the object
  store._init();

  const queries = deep_copy(QUERIES);

  const create_table = function (table_name, q) {
    //console.log("create_table", table_name)
    return class P extends Table {
      constructor(a, b) {
        super(a, b);
        this.query = this.query.bind(this);
        this.options = this.options.bind(this);
        this._change = this._change.bind(this);
      }

      query() {
        return { [table_name]: q.query };
      }
      options() {
        return q.options;
      }
      _change(table) {
        return actions.setState({ [table_name]: table.get() });
      }
    };
  };

  function init_table(table_name: string): void {
    const name = project_redux_name(project_id, table_name);
    try {
      // throws error only if it does not exist already
      redux.getTable(name);
      return;
    } catch {}

    const q = queries[table_name];
    for (const k in q) {
      const v = q[k];
      if (typeof v === "function") {
        q[k] = v();
      }
    }
    q.query.project_id = project_id;
    redux.createTable(name, create_table(table_name, q));
  }

  store.init_table = init_table;

  store.close_table = (table_name: string) => {
    redux.removeTable(project_redux_name(project_id, table_name));
  };

  store.close_all_tables = () => {
    for (const table_name in queries) {
      store.close_table(table_name);
    }
  };

  return store;
}

export function useStrippedPublicPaths(project_id: string): PublicPath[] {
  const public_paths = useTypedRedux({ project_id }, "public_paths");
  return useMemo(() => {
    const rows = public_paths?.valueSeq()?.toJS() ?? [];
    return rows as unknown as PublicPath[];
  }, [public_paths]);
}
