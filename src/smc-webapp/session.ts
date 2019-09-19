/*
Session management

Initially only the simplest possible client-side implementation.
*/

const { throttle } = require("underscore");
const { webapp_client } = require("./webapp_client");
const misc_page = require("./misc_page");
import { AppRedux } from "./app-framework";
import * as LS from "misc/local-storage";
import { COCALC_MINIMAL } from "./fullscreen";

const async = require("async");

exports.session_manager = (name, redux) => {
  if (COCALC_MINIMAL) return null;
  return new SessionManager(name, redux);
};

interface State {
  // project_id <=> filenames
  [k: string]: string[];
}

class SessionManager {
  private name: string;
  private redux: AppRedux;
  private _local_storage_name: LS.CustomKey;
  private _local_storage_name_closed: LS.CustomKey;
  private _state: State[];
  private _ignore: boolean;
  private _state_closed: State;
  private _initialized: boolean;

  constructor(name: string, redux: AppRedux) {
    // important: run init in any case in order to run @load_url_target,
    // but do not actually create a session if @name is '' or null/undefined
    this.load_url_target = this.load_url_target.bind(this);
    this.init_local_storage = this.init_local_storage.bind(this);
    this.save = this.save.bind(this);
    this.close_project = this.close_project.bind(this);
    this._save_to_local_storage = this._save_to_local_storage.bind(this);
    this._save_to_local_storage_closed = this._save_to_local_storage_closed.bind(
      this
    );
    this.restore = this.restore.bind(this);
    this._restore_project = this._restore_project.bind(this);
    this._restore_all = this._restore_all.bind(this);
    this._load_from_local_storage = this._load_from_local_storage.bind(this);

    // init attributes
    this.name = name;
    this.redux = redux;

    // actual initialization
    if (webapp_client.is_signed_in()) {
      this.init_local_storage();
    } else {
      webapp_client.once("signed_in", () => {
        return this.init_local_storage();
      });
    }
    if (this.name) {
      this.save = throttle(this.save, 1000);
    }
  }

  load_url_target(): void {
    // **after** a possible session is restored,
    // and project tabs are in correct order (or nothing is opened yet)
    // we open up the URL target and put it into foreground
    if (misc_page.should_load_target_url()) {
      require("./history").load_target((window as any).smc_target, true);
      (window as any).smc_target = "";
    }
  }

  init_local_storage(): void {
    if (this.name) {
      const { APP_BASE_URL } = require("misc_page");
      const prefix = APP_BASE_URL ? `.${APP_BASE_URL}` : "";
      const postfix = `${webapp_client.account_id}.${this.name}`;
      this._local_storage_name = new LS.CustomKey(
        `session${prefix}.${postfix}`
      );
      this._local_storage_name_closed = new LS.CustomKey(
        `closed-session${prefix}.${postfix}`
      );
      this._load_from_local_storage();
    }

    // Wait until projects *and* accounts are
    // defined (loaded from db) before trying to
    // restore open projects and their files.
    // Otherwise things will randomly fail.
    async.series(
      [
        cb => {
          return this.redux.getStore("account").wait({
            until(store) {
              return store.get("editor_settings") != null;
            },
            cb
          });
        },
        cb => {
          return this.redux.getStore("projects").wait({
            until(store) {
              return store.get("project_map") != null;
            },
            cb
          });
        }
      ],
      err => {
        if (err) {
          console.warn("Error restoring session:", err);
        } else {
          if (this.name) {
            this.restore();
          }
        }
        this._initialized = true;
        // session restore done, one way or another ...
        this.load_url_target();
      }
    );
  }

  save(): void {
    if (this._ignore || !this._initialized) {
      return;
    }
    this._state = get_session_state(this.redux);
    this._save_to_local_storage();
  }

  // Call this right before closing a project to save its list of open files, so when the
  // file is re-opened they get opened too.
  close_project(project_id): void {
    if (!this._initialized) {
      return;
    }
    const open_files = this.redux
      .getProjectStore(project_id)
      .get("open_files_order")
      .toJS();

    if (open_files == null) {
      return;
    }
    this._state_closed[project_id] = open_files;
    this._save_to_local_storage_closed();
  }

  _save_to_local_storage(): void {
    if (this._state == null || this._local_storage_name == null) {
      return;
    }
    LS.set(this._local_storage_name, this._state);
  }

  _save_to_local_storage_closed(): void {
    if (this._state_closed == null || this._local_storage_name == null) {
      return;
    }
    LS.set(this._local_storage_name_closed, this._state_closed);
  }

  restore(project_id?: string): void {
    if (project_id != null) {
      this._restore_project(project_id);
    } else {
      this._restore_all();
    }
  }

  // Call right when you open a project.  It returns all files that should automatically
  // be opened, then removes that list from localStorage.  Returns undefined if nothing known.
  _restore_project(project_id): void {
    if (this._state_closed == null || !this._initialized) {
      return;
    }
    const open_files = this._state_closed[project_id];
    delete this._state_closed[project_id];
    if (open_files != null && !this._ignore) {
      const project = this.redux.getProjectActions(project_id);
      open_files.map(path =>
        project.open_file({
          path,
          foreground: false,
          foreground_project: false
        })
      );
    }
  }

  _restore_all(): void {
    if (this._local_storage_name == null) {
      return;
    }
    try {
      this._ignore = true; // don't want to save state **while** restoring it, obviously.
      restore_session_state(this.redux, this._state);
    } catch (err) {
      console.warn("FAILED to restore state", err);
      this._save_to_local_storage(); // set back to a valid state
    } finally {
      delete this._ignore;
    }
  }

  _load_from_local_storage(): void {
    if (this._local_storage_name == null) {
      return;
    }

    this._state = [];
    this._state_closed = {};
    {
      let ss: State[] | undefined = LS.get<State[]>(this._local_storage_name);
      if (ss != null && ss) {
        try {
          this._state = ss;
        } catch (err) {
          LS.del(this._local_storage_name);
          console.warn(err);
        }
      }
    }
    {
      let sc = LS.get<State>(this._local_storage_name_closed);
      if (sc != null && sc) {
        try {
          this._state_closed = sc;
        } catch (err) {
          LS.del(this._local_storage_name_closed);
          console.warn(err);
        }
      }
    }
  }
}

const get_session_state = function(redux: AppRedux): State[] {
  const state: State[] = [];
  redux
    .getStore("projects")
    .get("open_projects")
    .forEach(project_id => {
      state.push({
        [project_id]: redux
          .getProjectStore(project_id)
          .get("open_files_order")
          .toJS()
      });
      return true;
    });
  return state;
};

// reset_first is currently not used.  If true, then you get *exactly* the
// saved session; if not set (the default) the current state and the session are merged.
const restore_session_state = function(
  redux: AppRedux,
  state: State[],
  reset_first?: boolean
): void {
  let project_id;
  if (reset_first == null) {
    reset_first = false;
  }
  if (state == null) {
    return;
  }

  // TODO how to type this a "PageAction" such that close_project_tab is known?
  const page = redux.getActions("page") as any;

  if (reset_first) {
    redux
      .getStore("projects")
      .get("open_projects")
      .map(project_id => page.close_project_tab(project_id));
  }

  const projects = redux.getActions("projects");
  state.map(x => {
    for (project_id in x) {
      const paths = x[project_id];
      // restore_session false, b/c we only want to see the tabs from the session
      projects.open_project({
        project_id,
        switch_to: false,
        restore_session: false
      });
      if (paths.length > 0) {
        const project = redux.getProjectActions(project_id);
        paths.map(path =>
          project.open_file({
            path,
            foreground: false,
            foreground_project: false
          })
        );
      }
    }
  });
};
