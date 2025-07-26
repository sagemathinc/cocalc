/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

let wrapped_editors;

// TODO: we should refactor our code to now have these window/document references
// in *this* file.  This very code (all the redux/store stuff) is used via node.js
// in projects, so should not reference window or document.

declare let window, document;
if (typeof window !== "undefined" && window !== null) {
  // don't import in case not in browser (for testing)
  wrapped_editors = require("./editors/react-wrapper");
}

import * as immutable from "immutable";

import {
  AppRedux,
  project_redux_name,
  redux,
  Store,
  Table,
  TypedMap,
} from "@cocalc/frontend/app-framework";
import { fileURL } from "@cocalc/frontend/lib/cocalc-urls";
import { get_local_storage } from "@cocalc/frontend/misc";
import { QueryParams } from "@cocalc/frontend/misc/query-params";
import { remove } from "@cocalc/frontend/project-file";
import { ProjectLogMap } from "@cocalc/frontend/project/history/types";
import {
  FILE_ACTIONS,
  ProjectActions,
  QUERIES,
} from "@cocalc/frontend/project_actions";
import {
  Available as AvailableFeatures,
  isMainConfiguration,
  ProjectConfiguration,
} from "@cocalc/frontend/project_configuration";
import * as misc from "@cocalc/util/misc";
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

export { FILE_ACTIONS as file_actions, ProjectActions };

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
  public_paths?: immutable.Map<string, immutable.Map<string, any>>;

  show_upload: boolean;
  create_file_alert: boolean;
  displayed_listing?: any; // computed(object),
  configuration?: ProjectConfiguration;
  configuration_loading: boolean; // for UI feedback
  available_features?: TypedMap<AvailableFeatures>;
  show_custom_software_reset: boolean;

  // Project Page
  active_project_tab: string;
  num_ghost_file_tabs: number;
  flyout: FixedTab | null;
  flyout_log_mode: FlyoutLogMode;
  flyout_log_deduplicate: FlyoutLogDeduplicate;
  flyout_log_filter: immutable.List<FlyoutLogFilter>;
  flyout_active_mode: FlyoutActiveMode;

  // Project Files
  activity: any; // immutable,
  active_file_sort: TypedMap<{ column_name: string; is_descending: boolean }>;
  page_number: number;
  file_action?: string; // undefineds is meaningfully none here
  file_search?: string;
  show_hidden?: boolean;
  show_masked?: boolean;
  error?: string;
  checked_files: immutable.Set<string>;
  selected_file_index?: number; // Index on file listing to highlight starting at 0. undefined means none highlighted
  new_name?: string;
  most_recent_file_click?: string;
  show_library: boolean;
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
  library?: immutable.Map<string, any>;
  library_selected?: immutable.Map<string, any>;
  library_is_copying?: boolean; // for the copy button, to signal an ongoing copy process
  library_search?: string; // if given, restricts to library entries that match the search

  // Project Find
  user_input: string;
  search_results?: any; // immutable.List,
  search_error?: string;
  too_many_results?: boolean;
  command?: string;
  most_recent_search?: string;
  most_recent_path: string;
  subdirectories?: boolean;
  case_sensitive?: boolean;
  hidden_files?: boolean;
  git_grep: boolean;
  info_visible?: boolean;
  neural_search?: boolean;

  // Project Settings
  get_public_path_id?: (path: string) => any;
  stripped_public_paths: any; //computed(immutable.List)

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

  compute_servers?;
  create_compute_server?: boolean;
  create_compute_server_template_id?: number;

  // Default compute server id to use when browsing and
  // working with files.
  compute_server_id: number;
  // Map from path to the id of the compute server that the file is supposed to opened on right now.
  compute_server_ids?: TypedMap<{ [path: string]: number }>;
}

export class ProjectStore extends Store<ProjectStoreState> {
  public project_id: string;
  private previous_runstate: string | undefined;
  public readonly computeServerIdLocalStorageKey: string;

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
    this.computeServerIdLocalStorageKey = `project-compute-server-id-${this.project_id}`;
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
        remove(path, redux, this.project_id, false);
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
    let create_compute_server_template_id: number | undefined = undefined;
    let create_compute_server: boolean | undefined = undefined;
    const template = QueryParams.get("compute-server-template");
    if (template) {
      const [id, project_id] = template.split(".");
      if (id && project_id == this.project_id) {
        create_compute_server_template_id = parseInt(id);
        create_compute_server = true;
        QueryParams.remove("compute-server-template");
      }
    }
    const other_settings = redux.getStore("account")?.get("other_settings");
    let compute_server_id;
    try {
      const key = this.computeServerIdLocalStorageKey;
      const value = get_local_storage(key);
      compute_server_id = parseInt((value as any) ?? "0");
    } catch (_) {
      compute_server_id = 0;
    }
    return {
      // Shared
      current_path: "",
      history_path: "",
      open_files: immutable.Map<immutable.Map<string, any>>({}),
      open_files_order: immutable.List([]),
      just_closed_files: immutable.List([]),
      show_upload: false,
      create_file_alert: false,
      displayed_listing: undefined, // computed(object),
      show_masked: true,
      configuration: undefined,
      configuration_loading: false, // for UI feedback
      show_custom_software_reset: false,

      // Project Page
      active_project_tab: "files",
      num_ghost_file_tabs: 0,
      flyout: null,
      flyout_log_mode: FLYOUT_LOG_DEFAULT_MODE,
      flyout_log_deduplicate: FLYOUT_LOG_DEFAULT_DEDUP,
      flyout_active_mode: FLYOUT_ACTIVE_DEFAULT_MODE,
      flyout_log_filter: immutable.List(FLYOUT_LOG_FILTER_DEFAULT),

      // Project Files
      activity: undefined,
      page_number: 0,
      checked_files: immutable.Set(),
      show_library: false,
      file_listing_scroll_top: undefined,
      active_file_sort: TypedMap({
        is_descending: false,
        column_name: other_settings?.get("default_file_sort") ?? "time",
      }),

      // Project New
      library: immutable.Map({}),
      library_is_copying: false, // for the copy button, to signal an ongoing copy process
      downloading_file: false,

      // Project Find
      user_input: "",
      git_grep: other_settings?.get("find_git_grep") ?? true,
      subdirectories: other_settings?.get("find_subdirectories"),
      case_sensitive: other_settings?.get("find_case_sensitive"),
      hidden_files: other_settings?.get("find_hidden_files"),

      most_recent_path: "",

      // Project Settings
      stripped_public_paths: this.selectors.stripped_public_paths.fn,

      other_settings: undefined,

      compute_server_id,
      create_compute_server,
      create_compute_server_template_id,
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
          // (this exists because rethinkdb doesn't have compound primary keys)
          const { SCHEMA, client_db } = require("@cocalc/util/schema");
          return SCHEMA.public_paths.user_query.set.fields.id(
            { project_id, path },
            client_db,
          );
        };
      },
    },


    stripped_public_paths: {
      dependencies: ["public_paths"] as const,
      fn: () => {
        const public_paths = this.get("public_paths");
        if (public_paths != null) {
          return immutable.fromJS(
            (() => {
              const result: any[] = [];
              const object = public_paths.toJS();
              for (const id in object) {
                const x = object[id];
                result.push(misc.copy_without(x, ["id", "project_id"]));
              }
              return result;
            })(),
          );
        }
      },
    },
  };

  // Returns the cursor positions for the given project_id/path, if that
  // file is opened, and supports cursors and is either old (and ...) or
  // is in react and has store with a cursors key.
  get_users_cursors = (path, account_id) => {
    const store: any = redux.getEditorStore(this.project_id, path);
    if (store == null) {
      // try non-react editor
      const editors = wrapped_editors.get_editor(this.project_id, path);
      if (editors && editors.get_users_cursors) {
        return editors.get_users_cursors(account_id);
      } else {
        return undefined;
      }
    } else {
      return store.get("cursors") && store.get("cursors").get(account_id);
    }
  };

  is_file_open = (path) => {
    return this.getIn(["open_files", path]) != null;
  };

  fileURL = (path, compute_server_id?: number) => {
    return fileURL({
      project_id: this.project_id,
      path,
      compute_server_id: compute_server_id ?? this.get("compute_server_id"),
    });
  };

  // returns false, if this project isn't capable of opening a file with the given extension
  async can_open_file_ext(
    ext: string,
    actions: ProjectActions,
  ): Promise<boolean> {
    // to make sure we know about disabled file types
    const conf = await actions.init_configuration("main");
    // if we don't know anything, we're optimistic and skip this check
    if (conf == null) return true;
    if (!isMainConfiguration(conf)) return true;
    const disabled_ext = conf.disabled_ext;
    return !disabled_ext.includes(ext);
  }

  public has_file_been_viewed(path: string): boolean {
    // note that component is NOT an immutable.js object:
    return this.getIn(["open_files", path, "component"])?.Editor != null;
  }
}

// Mutates data to include info on public paths.
export function mutate_data_to_compute_public_files(
  data,
  public_paths,
  current_path,
) {
  const { listing } = data;
  const pub = data.public;
  if (public_paths != null && public_paths.size > 0) {
    const head = current_path ? current_path + "/" : "";
    const paths: string[] = [];
    const public_path_data = {};
    for (const x of public_paths.toJS()) {
      if (x.disabled) {
        // Do not include disabled paths.  Otherwise, it causes this confusing bug:
        //    https://github.com/sagemathinc/cocalc/issues/6159
        continue;
      }
      public_path_data[x.path] = x;
      paths.push(x.path);
    }
    for (const x of listing) {
      const full = head + x.name;
      const p = misc.containing_public_path(full, paths);
      if (p != null) {
        x.public = public_path_data[p];
        x.is_public = !x.public.disabled;
        pub[x.name] = public_path_data[p];
      }
    }
  }
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

  const queries = misc.deep_copy(QUERIES);

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
