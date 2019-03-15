/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2015 -- 2016, SageMath, Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################
let wrapped_editors;

// TODO: we should refactor our code to now have these window/document references
// in *this* file.  This very code (all the redux/store stuff) is used via node.js
// in projects, so should not reference window or document.

declare var window, document;
if (typeof window !== "undefined" && window !== null) {
  // don't import in case not in browser (for testing)
  wrapped_editors = require("./editor_react_wrapper");
}
import * as immutable from "immutable";

const misc = require("smc-util/misc");
import { QUERIES, FILE_ACTIONS, ProjectActions } from "./project_actions";
import { Available as AvailableFeatures } from "./project_configuration";

import {
  project_redux_name,
  Table,
  redux,
  Store,
  AppRedux
} from "./app-framework";

import { literal } from "./app-framework/literal";

import { ProjectConfiguration } from "./project_configuration";

export { FILE_ACTIONS as file_actions, ProjectActions };

const MASKED_FILE_EXTENSIONS = {
  py: ["pyc"],
  java: ["class"],
  cs: ["exe"],
  tex: "aux bbl blg fdb_latexmk fls glo idx ilg ind lof log nav out snm synctex.gz toc xyc synctex.gz(busy) sagetex.sage sagetex.sout sagetex.scmd sagetex.sage.py sage-plots-for-FILENAME pytxcode pythontex-files-BASEDASHNAME pgf-plot.gnuplot pgf-plot.table".split(
    " "
  ),
  rnw: ["tex", "NODOT-concordance.tex"],
  rtex: ["tex", "NODOT-concordance.tex"],
  rmd: ["pdf", "html", "nb.html", "md", "NODOT_files"]
};

export interface ProjectStoreState {
  // Shared
  current_path: string;
  history_path: string;
  open_files: immutable.Map<string, immutable.Map<string, any>>;
  open_files_order: immutable.List<string>;
  public_paths?: any; // immutable.List,
  directory_listings: any; // immutable,
  show_upload: boolean;
  create_file_alert: boolean;
  displayed_listing?: any; // computed(object),
  configuration?: ProjectConfiguration;
  available_features?: AvailableFeatures;

  // Project Page
  active_project_tab: string;
  free_warning_closed: boolean; // Makes bottom height update
  free_warning_extra_shown: boolean;
  num_ghost_file_tabs: number;

  // Project Files
  activity: any; // immutable,
  active_file_sort?: any; // computed {column_name : string, is_descending : boolean}
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
  show_new: boolean;

  // Project Log
  project_log?: any; // immutable,
  project_log_all?: any; // immutable,
  search?: string;
  page?: number;

  // Project New
  default_filename?: string;
  file_creation_error?: string;
  library: immutable.Map<any, any>;
  library_selected?: object;
  library_is_copying: boolean; // for the copy button, to signal an ongoing copy process
  library_docs_sorted?: any; //computed(immutable.List),

  // Project Find
  user_input: string;
  search_results?: any; // immutable.List,
  search_error?: string;
  too_many_results?: boolean;
  command?: string;
  most_recent_search?: string;
  most_recent_path?: string;
  subdirectories?: boolean;
  case_sensitive?: boolean;
  hidden_files?: boolean;
  info_visible?: boolean;
  git_grep: boolean;

  // Project Settings
  get_public_path_id?: (path: string) => any;
  stripped_public_paths: any; //computed(immutable.List)

  other_settings: any;
}

export class ProjectStore extends Store<ProjectStoreState> {
  public project_id: string;

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
  }

  _init = () => {
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
      return projects.on("change", this._projects_store_change);
    }
  };

  destroy = () => {
    let projects_store = this.redux.getStore("projects");
    if (projects_store !== undefined) {
      projects_store.removeListener("change", this._projects_store_change);
    }
  };

  // constructor binds this callback, such that "this.project_id" works!
  private _projects_store_change(state): void {
    const change = state.getIn(["project_map", this.project_id]);
    if (change == null) {
      // User has been removed from the project!
      (this.redux.getActions("page") as any).close_project_tab(this.project_id);
    }
  }

  getInitialState = () => {
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

      // Project Page
      active_project_tab: "files",
      free_warning_closed: false, // Makes bottom height update
      free_warning_extra_shown: false,
      num_ghost_file_tabs: 0,

      // Project Files
      activity: undefined,
      page_number: 0,
      checked_files: immutable.Set(),
      show_library: false,
      show_new: false,

      // Project New
      library: immutable.Map({}),
      library_is_copying: false, // for the copy button, to signal an ongoing copy process

      // Project Find
      user_input: "",
      git_grep: true,

      // Project Settings
      stripped_public_paths: this.selectors.stripped_public_paths.fn,

      other_settings: undefined
    };
  };

  // Selectors
  selectors = {
    other_settings: {
      fn: () => {
        return (this.redux.getStore("account") as any).get("other_settings");
      }
    },

    get_public_path_id: {
      fn: () => {
        const project_id = this.project_id;
        return function(path) {
          // (this exists because rethinkdb doesn't have compound primary keys)
          const { SCHEMA, client_db } = require("smc-util/schema");
          return SCHEMA.public_paths.user_query.set.fields.id(
            { project_id, path },
            client_db
          );
        };
      }
    },

    active_file_sort: {
      fn: () => {
        if (this.getIn(["active_file_sort"]) != null) {
          return this.getIn(["active_file_sort"]).toJS();
        } else {
          const is_descending = false;
          const column_name = (this.redux.getStore("account") as any).getIn([
            "other_settings",
            "default_file_sort"
          ]);
          return { is_descending, column_name };
        }
      }
    },

    // cached pre-processed file listing, which should always be up to date when
    // called, and properly depends on dependencies.
    displayed_listing: {
      dependencies: literal([
        "active_file_sort",
        "current_path",
        "directory_listings",
        "stripped_public_paths",
        "file_search",
        "other_settings",
        "show_hidden",
        "show_masked"
      ]),
      fn: () => {
        const search_escape_char = "/";
        let listing = this.get("directory_listings").get(
          this.get("current_path")
        );
        if (typeof listing === "string") {
          if (
            listing.indexOf("ECONNREFUSED") !== -1 ||
            listing.indexOf("ENOTFOUND") !== -1
          ) {
            return { error: "no_instance" }; // the host VM is down
          } else if (listing.indexOf("o such path") !== -1) {
            return { error: "no_dir" };
          } else if (listing.indexOf("ot a directory") !== -1) {
            return { error: "not_a_dir" };
          } else if (listing.indexOf("not running") !== -1) {
            // yes, no underscore.
            return { error: "not_running" };
          } else {
            return { error: listing };
          }
        }
        if (listing == null) {
          return {};
        }
        if ((listing != null ? listing.errno : undefined) != null) {
          return { error: misc.to_json(listing) };
        }
        listing = listing.toJS();

        if (this.get("other_settings").get("mask_files")) {
          _compute_file_masks(listing);
        }

        if (this.get("current_path") === ".snapshots") {
          _compute_snapshot_display_names(listing);
        }

        const search = this.get("file_search");
        if (search && search[0] !== search_escape_char) {
          listing = _matched_files(search.toLowerCase(), listing);
        }

        const sorter = (() => {
          switch (this.get("active_file_sort").column_name) {
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

        listing.sort(sorter);

        if (this.get("active_file_sort").is_descending) {
          listing.reverse();
        }

        if (!this.get("show_hidden")) {
          listing = (() => {
            const result: string[] = [];
            for (let l of listing) {
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
            _compute_file_masks(listing);
          }

          const filtered: string[] = [];
          for (let f of listing) {
            if (!f.mask) filtered.push(f);
          }
          listing = filtered;
        }

        const map = {};
        for (var x of listing) {
          map[x.name] = x;
        }

        x = {
          listing,
          public: {},
          path: this.get("current_path"),
          file_map: map
        };

        _compute_public_files(
          x,
          this.get("stripped_public_paths"),
          this.get("current_path")
        );

        return x;
      }
    },

    stripped_public_paths: {
      dependencies: literal(["public_paths"]),
      fn: () => {
        const public_paths = this.get("public_paths");
        if (public_paths != null) {
          return immutable.fromJS(
            (() => {
              const result: any[] = [];
              const object = public_paths.toJS();
              for (let _ in object) {
                const x = object[_];
                result.push(misc.copy_without(x, ["id", "project_id"]));
              }
              return result;
            })()
          );
        }
      }
    },

    library_docs_sorted: {
      dependencies: literal(["library"]),
      fn: () => {
        const docs = this.get("library").getIn(["examples", "documents"]);
        const metadata = this.get("library").getIn(["examples", "metadata"]);

        if (docs != null) {
          // sort by a triplet: idea is to have the docs sorted by their category,
          // where some categories have weights (e.g. "introduction" comes first, no matter what)
          const sortfn = function(doc) {
            return [
              metadata.getIn(["categories", doc.get("category"), "weight"]) ||
                0,
              metadata
                .getIn(["categories", doc.get("category"), "name"])
                .toLowerCase(),
              (doc.get("title") && doc.get("title").toLowerCase()) ||
                doc.get("id")
            ];
          };
          return docs.sortBy(sortfn);
        }
      }
    }
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

  is_file_open = path => {
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
          ? listing.find(val => val.get("name") === name)
          : undefined
    };
  };

  get_raw_link = path => {
    let url = document.URL;
    url = url.slice(0, url.indexOf("/projects/"));
    return `${url}/${this.project_id}/raw/${misc.encode_path(path)}`;
  };
}

function _match(words, s, is_dir) {
  s = s.toLowerCase();
  for (let t of words) {
    if (t[t.length - 1] === "/") {
      if (!is_dir) {
        return false;
      } else if (s.indexOf(t.slice(0, -1)) === -1) {
        return false;
      }
    } else if (s.indexOf(t) === -1) {
      return false;
    }
  }
  return true;
}

function _matched_files(search, listing) {
  if (listing == null) {
    return [];
  }
  const words = search.split(" ");
  return (() => {
    const result: string[] = [];
    for (let x of listing) {
      if (
        _match(words, x.display_name != null ? x.display_name : x.name, x.isdir)
      ) {
        result.push(x);
      }
    }
    return result;
  })();
}

function _compute_file_masks(listing) {
  const filename_map = misc.dict(listing.map(item => [item.name, item])); // map filename to file
  return (() => {
    const result: any[] = [];
    for (let file of listing) {
      // note: never skip already masked files, because of rnw/rtex->tex
      var filename = file.name;

      // mask compiled files, e.g. mask 'foo.class' when 'foo.java' exists
      var ext = misc.filename_extension(filename).toLowerCase();
      var basename = filename.slice(0, filename.length - ext.length);
      result.push(
        (() => {
          const result1: any[] = [];
          for (let mask_ext of MASKED_FILE_EXTENSIONS[ext] != null
            ? MASKED_FILE_EXTENSIONS[ext]
            : []) {
            // check each possible compiled extension
            var bn;
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
            result1.push(
              filename_map[`${bn}${mask_ext}`] != null
                ? (filename_map[`${bn}${mask_ext}`].mask = true)
                : undefined
            );
          }
          return result1;
        })()
      );
    }
    return result;
  })();
}

function _compute_snapshot_display_names(listing) {
  return (() => {
    const result: number[] = [];
    for (let item of listing) {
      const tm = misc.parse_bup_timestamp(item.name);
      item.display_name = `${tm}`;
      result.push((item.mtime = (tm - 0) / 1000));
    }
    return result;
  })();
}

// Mutates data to include info on public paths.
function _compute_public_files(data, public_paths, current_path) {
  const { listing } = data;
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
      for (x of listing) {
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
  return function(a, b) {
    return misc.cmp(
      a[field] !== undefined ? a[field].toLowerCase() : "",
      b[field] !== undefined ? b[field].toLowerCase() : ""
    );
  };
}

function _sort_on_numerical_field(field, factor = 1) {
  return (a, b) =>
    misc.cmp(
      (a[field] != null ? a[field] : -1) * factor,
      (b[field] != null ? b[field] : -1) * factor
    );
}

export function init(project_id: string, redux: AppRedux): ProjectStore {
  const name = project_redux_name(project_id);
  if (redux.hasStore(name)) {
    const store: ProjectStore | undefined = redux.getStore(name);
    // this makes TS happy. we already check that it exists due to "hasStore()"
    if (store != null) return store;
  }

  // Initialize everything
  const store = redux.createStore(name, ProjectStore);
  const actions = redux.createActions(name, ProjectActions);
  store.project_id = project_id;
  actions.project_id = project_id; // so actions can assume this is available on the object
  store._init();

  const queries = misc.deep_copy(QUERIES);
  const create_table = function(table_name, q) {
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
    for (let k in q) {
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
