/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Session management
*/

import { throttle } from "underscore";
import { webapp_client } from "./webapp-client";
import { should_load_target_url } from "./misc";
import { AppRedux } from "./app-framework";
import { COCALC_MINIMAL } from "./fullscreen";
import { callback2 } from "@cocalc/util/async-utils";
import * as LS from "./misc/local-storage-typed";
import { bind_methods } from "@cocalc/util/misc";
import target from "@cocalc/frontend/client/handle-target";
import { load_target } from "./history";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

const log = (..._args) => {
  // console.log("session: ", ..._args);
};

export function session_manager(name, redux): SessionManager | undefined {
  const sm = new SessionManager(name, redux);
  if (COCALC_MINIMAL) {
    // we only need the session manager to open a target URL
    return undefined;
  } else {
    return sm;
  }
}

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
    /* IMPORTANT: run some code below ALWAYS in order to run
       this.load_url_target to load what the user's browser URL
       is requesting, but do not actually create a session if
       this.name==''.
    */
    bind_methods(this);

    // init attributes
    this.name = name;
    this.redux = redux;

    // actual initialization
    if (webapp_client.is_signed_in()) {
      this.init_local_storage();
    } else {
      webapp_client.once("signed_in", () => {
        this.init_local_storage();
      });
    }
    if (this.name) {
      this.save = throttle(this.save, 1000);
    }
  }

  private static load_url_target(): void {
    // **after** a possible session is restored,
    // and project tabs are in correct order (or nothing is opened yet)
    // we open up the URL target and put it into foreground
    if (should_load_target_url()) {
      load_target(target, true);
    }
  }

  private async init_local_storage(): Promise<void> {
    if (this.name) {
      const prefix = appBasePath.length > 1 ? `.${appBasePath}` : "";
      const postfix = `${webapp_client.account_id}.${this.name}`;
      this._local_storage_name = new LS.CustomKey(
        `session${prefix}.${postfix}`,
      );
      this._local_storage_name_closed = new LS.CustomKey(
        `closed-session${prefix}.${postfix}`,
      );
      this._load_from_local_storage();
    }

    // Wait until projects *and* accounts are
    // defined (loaded from db) before trying to
    // restore open projects and their files.
    // Otherwise things will randomly fail.
    try {
      await callback2(this.redux.getStore("account").wait, {
        until(store) {
          return store.get("editor_settings") != null;
        },
      });

      // minimal mode doesn't init any projects
      await callback2(this.redux.getStore("projects").wait, {
        until(store) {
          if (COCALC_MINIMAL) {
            // this is actually an empty "List"
            return store.get("open_projects") != null;
          } else {
            // wait for some data
            return store.get("project_map") != null;
          }
        },
      });

      // we're done -- restore session
      if (this.name) {
        this.restore();
      }

      this._initialized = true;
      // ... and load a target URL
      SessionManager.load_url_target();
    } catch (err) {
      console.warn("Error restoring session:", err);
    }
  }

  save(): void {
    if (this._ignore || !this._initialized) {
      return;
    }
    this._state = getSessionState(this.redux);
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

  private _save_to_local_storage(): void {
    if (this._state == null || this._local_storage_name == null) {
      return;
    }
    LS.set(this._local_storage_name, this._state);
  }

  private _save_to_local_storage_closed(): void {
    if (this._state_closed == null || this._local_storage_name == null) {
      return;
    }
    LS.set(this._local_storage_name_closed, this._state_closed);
  }

  restore(project_id?: string): void {
    log("restore", project_id);
    if (project_id != null) {
      this._restore_project(project_id);
    } else {
      this._restore_all();
    }
  }

  // Call right when you open a project.  It returns all files that should automatically
  // be opened, then removes that list from localStorage.  Returns undefined if nothing known.
  private _restore_project(project_id): void {
    log("_restore_project");
    if (this._state_closed == null || !this._initialized) {
      return;
    }
    const open_files = this._state_closed[project_id];
    delete this._state_closed[project_id];
    if (open_files != null && !this._ignore) {
      const project = this.redux.getProjectActions(project_id);
      open_files.map((path) =>
        project.open_file({
          path,
          foreground: false,
          foreground_project: false,
        }),
      );
    }
  }

  private _restore_all(): void {
    if (this._local_storage_name == null || this._state == null) {
      log("_restore_all -- not setup yet");
      return;
    }
    log("_restore_all -- doing it");
    try {
      this._ignore = true; // don't want to save state **while** restoring it, obviously.
      restoreSessionState(this.redux, this._state);
    } catch (err) {
      console.warn("FAILED to restore state", err);
      this._save_to_local_storage(); // set back to a valid state
    } finally {
      this._ignore = false;
    }
  }

  private _load_from_local_storage(): void {
    if (this._local_storage_name == null) {
      return;
    }

    this._state = [];
    this._state_closed = {};
    {
      const ss: State[] | undefined = LS.get<State[]>(this._local_storage_name);
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
      const sc = LS.get<State>(this._local_storage_name_closed);
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

function getSessionState(redux: AppRedux): State[] {
  const state: State[] = [];
  redux
    .getStore("projects")
    .get("open_projects")
    .forEach((project_id) => {
      state.push({
        [project_id]: redux
          .getProjectStore(project_id)
          .get("open_files_order")
          .toJS(),
      });
      return true;
    });
  return state;
}

function restoreSessionState(redux: AppRedux, state: State[]): void {
  log("restoreSessionState", state);
  const projects = redux.getActions("projects");
  for (const openTabsInProject of state) {
    for (const project_id in openTabsInProject) {
      const paths = openTabsInProject[project_id];
      // restore_session false, b/c we only want to see the tabs from the session
      try {
        projects.open_project({
          project_id,
          switch_to: false,
          restore_session: false,
        });
      } catch (err) {
        // this could happen, e.g., invalid project_id, and shouldn't be fatal.
        console.warn("Unable to open a project", err);
        continue;
      }
      if (paths.length > 0) {
        const project = redux.getProjectActions(project_id);
        for (const path of paths) {
          try {
            project.open_file({
              path,
              foreground: false,
              foreground_project: false,
            });
          } catch (err) {
            // no clue if this could happen or not now, but maybe someday, and also shouldn't be fatal.
            console.warn("Unable to open a file", path);
            continue;
          }
        }
      }
    }
  }
}
