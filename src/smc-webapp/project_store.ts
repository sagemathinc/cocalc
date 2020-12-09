/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
import * as misc from "smc-util/misc";
import { QUERIES, FILE_ACTIONS, ProjectActions } from "./project_actions";
import {
  Available as AvailableFeatures,
  isMainConfiguration,
} from "./project_configuration";
import { derive_rmd_output_filename } from "./frame-editors/rmd-editor/utils";
import {
  project_redux_name,
  Table,
  redux,
  Store,
  AppRedux,
  TypedMap,
} from "./app-framework";

import { ProjectConfiguration } from "./project_configuration";
import { ProjectLogMap } from "./project/history/types";
import { alert_message } from "./alerts";
import { Listings, listings } from "./project/websocket/listings";
import { deleted_file_variations } from "smc-util/delete-files";
import { DirectoryListing, DirectoryListingEntry } from "smc-util/types";

export { FILE_ACTIONS as file_actions, ProjectActions };

const MASKED_FILENAMES = ["__pycache__"];

const MASKED_FILE_EXTENSIONS = {
  py: ["pyc"],
  java: ["class"],
  cs: ["exe"],
  tex: "aux bbl blg fdb_latexmk fls glo idx ilg ind lof log nav out snm synctex.gz toc xyc synctex.gz(busy) sagetex.sage sagetex.sout sagetex.scmd sagetex.sage.py sage-plots-for-FILENAME pytxcode pythontex-files-BASEDASHNAME pgf-plot.gnuplot pgf-plot.table".split(
    " "
  ),
  rnw: ["tex", "NODOT-concordance.tex"],
  rtex: ["tex", "NODOT-concordance.tex"],
  rmd: ["pdf", "html", "nb.html", "md", "NODOT_files"],
  sage: ["sage.py"],
};

export type ModalInfo = TypedMap<{
  title: string | JSX.Element;
  content: string | JSX.Element;
  onOk?: any;
  onCancel?: any;
}>;

export interface ProjectStoreState {
  // Shared
  current_path: string;
  history_path: string;
  open_files: immutable.Map<string, immutable.Map<string, any>>;
  open_files_order: immutable.List<string>;
  public_paths?: immutable.List<TypedMap<{ disabled?: boolean; path: string }>>;
  directory_listings: immutable.Map<string, any>; // immutable,
  show_upload: boolean;
  create_file_alert: boolean;
  displayed_listing?: any; // computed(object),
  configuration?: ProjectConfiguration;
  configuration_loading: boolean; // for UI feedback
  available_features?: TypedMap<AvailableFeatures>;
  show_custom_software_reset: boolean;

  // Project Page
  active_project_tab: string;
  free_warning_closed: boolean; // Makes bottom height update
  num_ghost_file_tabs: number;

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

  // Project Settings
  get_public_path_id?: (path: string) => any;
  stripped_public_paths: any; //computed(immutable.List)

  // Project Info
  show_project_info_explanation?: boolean;

  // Project Status
  status?: immutable.Map<string, any>; // this is smc-project/project-status/types::ProjectStatus;

  other_settings: any;

  // Modal -- if modal is set to a string, display that string as a yes/no question.
  // if Yes, then run the on_modal_yes function (if given).
  modal?: ModalInfo;
}

export class ProjectStore extends Store<ProjectStoreState> {
  public project_id: string;
  private previous_runstate: string | undefined;
  private listings: Listings | undefined;

  // Function to call to initialize one of the tables in this store.
  // This is purely an optimization, so project_log, project_log_all and public_paths
  // do not have to be initialized unless necessary.  The code
  // is a little awkward, since I didn't want to change things too
  // much while making this optimization.
  public init_table: (table_name: string) => void;

  // TODO what's a and b ?
  constructor(a, b) {
    super(a, b);
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
    if (this.listings != null) {
      this.listings.close();
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
    const other_settings = redux.getStore("account")?.get("other_settings");
    return {
      // Shared
      current_path: "",
      history_path: "",
      open_files: immutable.Map<immutable.Map<string, any>>({}),
      open_files_order: immutable.List([]),
      directory_listings: immutable.Map(), // immutable,
      show_upload: false,
      create_file_alert: false,
      displayed_listing: undefined, // computed(object),
      show_masked: true,
      configuration: undefined,
      configuration_loading: false, // for UI feedback
      show_custom_software_reset: false,

      // Project Page
      active_project_tab: "files",
      free_warning_closed: false, // Makes bottom height update
      num_ghost_file_tabs: 0,

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
          const { SCHEMA, client_db } = require("smc-util/schema");
          return SCHEMA.public_paths.user_query.set.fields.id(
            { project_id, path },
            client_db
          );
        };
      },
    },

    // cached pre-processed file listing, which should always be up to date when
    // called, and properly depends on dependencies.
    displayed_listing: {
      dependencies: [
        "active_file_sort",
        "current_path",
        "directory_listings",
        "stripped_public_paths",
        "file_search",
        "other_settings",
        "show_hidden",
        "show_masked",
      ] as const,
      fn: () => {
        const search_escape_char = "/";
        const listing_raw = this.get("directory_listings").get(
          this.get("current_path")
        );
        if (listing_raw == null) {
          return {};
        }
        const listing_files = listing_raw.get("files");
        if (typeof listing_files === "string") {
          if (
            listing_files.indexOf("ECONNREFUSED") !== -1 ||
            listing_files.indexOf("ENOTFOUND") !== -1
          ) {
            return { error: "no_instance" }; // the host VM is down
          } else if (listing_files.indexOf("o such path") !== -1) {
            return { error: "no_dir" };
          } else if (listing_files.indexOf("ot a directory") !== -1) {
            return { error: "not_a_dir" };
          } else if (listing_files.indexOf("not running") !== -1) {
            // yes, no underscore.
            return { error: "not_running" };
          } else {
            return { error: listing_files };
          }
        }
        if (listing_files == null) {
          return {};
        }
        if ((listing_files != null ? listing_files.errno : undefined) != null) {
          return { error: misc.to_json(listing_files) };
        }

        // this this point we know we have good data and no error
        const listing: DirectoryListing = listing_raw.toJS();

        if (this.get("other_settings").get("mask_files")) {
          _compute_file_masks(listing.files ?? []);
        }

        if (this.get("current_path") === ".snapshots") {
          compute_snapshot_display_names(listing.files);
        }

        const search = this.get("file_search");
        if (search && search[0] !== search_escape_char) {
          listing.files = _matched_files(search.toLowerCase(), listing.files);
        }

        const sorter = (() => {
          switch (this.get("active_file_sort").get("column_name")) {
            case "name":
              return _sort_on_string_field("name");
            case "time":
              return _sort_on_numerical_field("mtime", -1);
            case "size":
              return _sort_on_numerical_field("size");
            case "type":
              return (a, b) => {
                if (a.isdir && !b.isdir) {
                  return -1;
                } else if (b.isdir && !a.isdir) {
                  return 1;
                } else {
                  return misc.cmp_array(
                    a.name.split(".").reverse(),
                    b.name.split(".").reverse()
                  );
                }
              };
          }
        })();

        if (listing.files == null)
          throw new Error("listing.files must be defined");

        listing.files.sort(sorter);

        if (this.get("active_file_sort").get("is_descending")) {
          listing.files.reverse();
        }

        if (!this.get("show_hidden")) {
          listing.files = (() => {
            const result: DirectoryListingEntry[] = [];
            for (const l of listing.files) {
              if (!l.name.startsWith(".")) {
                result.push(l);
              }
            }
            return result;
          })();
        }

        if (!this.get("show_masked", true)) {
          // if we do not gray out files (and hence haven't computed the file mask yet)
          // we do it now!
          if (!this.get("other_settings").get("mask_files")) {
            _compute_file_masks(listing.files ?? []);
          }

          const filtered: DirectoryListingEntry[] = [];
          for (const f of listing.files) {
            if (!f.mask) filtered.push(f);
          }
          listing.files = filtered;
        }

        const map = {};
        for (const x of listing.files) {
          map[x.name] = x;
        }

        const res = {
          git_dir: listing.git_dir,
          files: listing.files,
          public: {},
          path: this.get("current_path"),
          file_map: map,
        };

        _compute_public_files(
          res,
          this.get("stripped_public_paths"),
          this.get("current_path")
        );

        return res;
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
              for (const _ in object) {
                const x = object[_];
                result.push(misc.copy_without(x, ["id", "project_id"]));
              }
              return result;
            })()
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

  get_item_in_path = (name, path) => {
    const listing = this.get("directory_listings").get(path);
    if (typeof listing === "string") {
      // must be an error
      return { err: listing };
    }
    return {
      item:
        listing != null
          ? listing.find((val) => val.get("name") === name)
          : undefined,
    };
  };

  get_raw_link = (path) => {
    let url = document.URL;
    url = url.slice(0, url.indexOf("/projects/"));
    return `${url}/${this.project_id}/raw/${misc.encode_path(path)}`;
  };

  // returns false, if this project isn't capable of opening a file with the given extension
  async can_open_file_ext(
    ext: string,
    actions: ProjectActions
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

  private close_deleted_file(path: string): void {
    const cur = this.get("current_path");
    if (path == cur || misc.startswith(cur, path + "/")) {
      // we are deleting the current directory, so let's cd to HOME.
      const actions = redux.getProjectActions(this.project_id);
      if (actions != null) {
        actions.set_current_path("");
      }
    }
    const all_paths = deleted_file_variations(path);
    for (const file of this.get("open_files").keys()) {
      if (all_paths.indexOf(file) != -1 || misc.startswith(file, path + "/")) {
        if (!this.has_file_been_viewed(file)) {
          // Hasn't even been viewed yet; when user clicks on the tab
          // they get a dialog to undelete the file.
          continue;
        }
        const actions = redux.getProjectActions(this.project_id);
        if (actions != null) {
          actions.close_tab(file);
          alert_message({
            type: "info",
            message: `Closing '${file}' since it was deleted or moved.`,
          });
        }
      } else {
        const actions: any = redux.getEditorActions(this.project_id, file);
        if (actions?.close_frames_with_path != null) {
          // close subframes with given path.
          if (actions.close_frames_with_path(path)) {
            alert_message({
              type: "info",
              message: `Closed '${path}' in '${file}' since it was deleted or moved.`,
            });
          }
        }
      }
    }
  }

  private async close_deleted_files(paths: string[]): Promise<void> {
    for (const path of paths) {
      if (this.listings == null) return; // won't happen
      const deleted = await this.listings.get_deleted(path);
      if (deleted != null) {
        for (let filename of deleted) {
          if (path != "") {
            filename = path + "/" + filename;
          }
          this.close_deleted_file(filename);
        }
      }
    }
  }

  public get_listings(): Listings {
    if (this.listings == null) {
      this.listings = listings(this.project_id);
      this.listings.on("deleted", this.close_deleted_files.bind(this));
      this.listings.on("change", async (paths) => {
        let directory_listings = this.get("directory_listings");
        for (const path of paths) {
          if (this.listings == null) return; // won't happen
          let data;
          if (this.listings.get_missing(path)) {
            try {
              data = immutable.fromJS(
                await this.listings.get_listing_directly(path)
              );
            } catch (err) {
              console.warn(
                `WARNING: problem getting directory listing ${err}; falling back`
              );
              data = await this.listings.get_for_store(path);
            }
          } else {
            data = await this.listings.get_for_store(path);
          }
          directory_listings = directory_listings.set(path, data);
        }
        const actions = redux.getProjectActions(this.project_id);
        actions.setState({ directory_listings });
      });
    }
    if (this.listings == null) {
      throw Error("bug");
    }
    return this.listings;
  }
}

function _matched_files(
  search: string,
  files?: DirectoryListingEntry[]
): DirectoryListingEntry[] {
  if (files == null) {
    return [];
  }
  const words = misc.search_split(search);
  const result: DirectoryListingEntry[] = [];
  for (const x of files) {
    const name = (x.display_name ?? x.name ?? "").toLowerCase();
    if (
      misc.search_match(name, words) ||
      (x.isdir && misc.search_match(name + "/", words))
    ) {
      result.push(x);
    }
  }
  return result;
}

function _compute_file_masks(files: DirectoryListingEntry[]): void {
  // mask compiled files, e.g. mask 'foo.class' when 'foo.java' exists
  // the general outcome of this function is to set for some file entry objects
  // in "listing" the attribute <file>.mask=true
  const filename_map = misc.dict(files.map((item) => [item.name, item])); // map filename to file
  for (const file of files) {
    // mask certain known directories
    if (MASKED_FILENAMES.indexOf(file.name) >= 0) {
      filename_map[file.name].mask = true;
    }

    // note: never skip already masked files, because of rnw/rtex->tex

    const ext = misc.filename_extension(file.name).toLowerCase();
    // some extensions like Rmd modify the basename during compilation
    const filename = (function () {
      switch (ext) {
        case "rmd":
          // converts .rmd to .rmd, but the basename changes!
          return derive_rmd_output_filename(file.name, "rmd");
        default:
          return file.name;
      }
    })();

    const basename = filename.slice(0, filename.length - ext.length);

    for (let mask_ext of MASKED_FILE_EXTENSIONS[ext] ?? []) {
      // check each possible compiled extension
      let bn; // derived basename
      // some uppercase-strings have special meaning
      if (misc.startswith(mask_ext, "NODOT")) {
        bn = basename.slice(0, -1); // exclude the trailing dot
        mask_ext = mask_ext.slice("NODOT".length);
      } else if (mask_ext.indexOf("FILENAME") >= 0) {
        bn = mask_ext.replace("FILENAME", filename);
        mask_ext = "";
      } else if (mask_ext.indexOf("BASENAME") >= 0) {
        bn = mask_ext.replace("BASENAME", basename.slice(0, -1));
        mask_ext = "";
      } else if (mask_ext.indexOf("BASEDASHNAME") >= 0) {
        // BASEDASHNAME is like BASENAME, but replaces spaces by dashes
        // https://github.com/sagemathinc/cocalc/issues/3229
        const fragment = basename.slice(0, -1).replace(/ /g, "-");
        bn = mask_ext.replace("BASEDASHNAME", fragment);
        mask_ext = "";
      } else {
        bn = basename;
      }
      const mask_fn = `${bn}${mask_ext}`;
      if (filename_map[mask_fn] != null) {
        filename_map[mask_fn].mask = true;
      }
    }
  }
}

function compute_snapshot_display_names(listing): void {
  for (const item of listing) {
    const tm = misc.parse_bup_timestamp(item.name);
    item.display_name = `${tm}`;
    item.mtime = tm.valueOf() / 1000;
  }
}

// Mutates data to include info on public paths.
function _compute_public_files(data, public_paths, current_path) {
  const { files } = data;
  const pub = data.public;
  if (public_paths != null && public_paths.size > 0) {
    const head = current_path ? current_path + "/" : "";
    const paths: string[] = [];
    const public_path_data = {};
    for (var x of public_paths.toJS()) {
      public_path_data[x.path] = x;
      paths.push(x.path);
    }
    return (() => {
      const result: any = [];
      for (x of files) {
        const full = head + x.name;
        const p = misc.containing_public_path(full, paths);
        if (p != null) {
          x.public = public_path_data[p];
          x.is_public = !x.public.disabled;
          result.push((pub[x.name] = public_path_data[p]));
        } else {
          result.push(undefined);
        }
      }
      return result;
    })();
  }
}

function _sort_on_string_field(field) {
  return function (a, b) {
    return misc.cmp(
      a[field] !== undefined ? a[field].toLowerCase() : "",
      b[field] !== undefined ? b[field].toLowerCase() : ""
    );
  };
}

function _sort_on_numerical_field(field, factor = 1) {
  return (a, b) => {
    const c = misc.cmp(
      (a[field] != null ? a[field] : -1) * factor,
      (b[field] != null ? b[field] : -1) * factor
    );
    if (c) return c;
    // break ties using the name, so well defined.
    return misc.cmp(a.name, b.name) * factor;
  };
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
    ProjectActions
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
    const q = queries[table_name];
    if (q == null) return; // already done
    delete queries[table_name]; // so we do not init again.
    for (const k in q) {
      const v = q[k];
      if (typeof v === "function") {
        q[k] = v();
      }
    }
    q.query.project_id = project_id;
    redux.createTable(
      project_redux_name(project_id, table_name),
      create_table(table_name, q)
    );
  }

  // public_paths is needed to show file listing and show
  // any individual file, so we just load it...
  init_table("public_paths");
  // project_log, on the other hand, is only loaded if needed.

  store.init_table = init_table;

  return store;
}
