/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Hook for getting anything from our global redux store, and this should
also work fine with computed properties.

Use it is as follows:

With a named store, such as "projects", "account", "page", etc.:

 useRedux(['name-of-store', 'path', 'in', 'store'])

With a specific project:

 useRedux(['path', 'in', 'project store'], 'project-id')

Or with an editor in a project:

 useRedux(['path', 'in', 'project store'], 'project-id', 'path')

*/

import { is_valid_uuid_string } from "../../smc-util/misc2";

import { redux, ProjectActions, ProjectStore } from "../app-framework";
import * as React from "react";

import * as types from "./actions-and-stores";

export function useReduxNamedStore(path: string[]) {
  const [value, set_value] = React.useState(() => {
    return redux.getStore(path[0])?.getIn(path.slice(1) as any) as any;
  });

  React.useEffect(() => {
    const store = redux.getStore(path[0]);
    if (store == null) {
      // TODO: I could make it return undefined until the store is created.
      // I *did* do this for useReduxEditorStore, but just haven't gotten
      // around to doing this for useReduxNamedStore yet.
      throw Error(`store "${path[0]}" must exist!`);
    }
    const subpath = path.slice(1);
    let last_value = value;
    const f = () => {
      if (!f.is_mounted) {
        // CRITICAL: even after removing the change listener, sometimes f gets called;
        // I don't know why EventEmitter has those semantics, but it definitely does.
        // That's why we *also* maintain this is_mounted flag.
        return;
      }
      const new_value = store.getIn(subpath as any);
      if (last_value !== new_value) {
        /*
        console.log("useReduxNamedStore change ", {
          name: path[0],
          path: JSON.stringify(path),
          new_value,
          last_value,
        });
        */
        last_value = new_value;
        set_value(new_value);
      }
    };
    f.is_mounted = true;
    store.on("change", f);
    return () => {
      f.is_mounted = false;
      store.removeListener("change", f);
    };
  }, [path[0]]);

  return value;
}

function useReduxProjectStore(path: string[], project_id: string) {
  const [value, set_value] = React.useState(() =>
    redux
      .getProjectStore(project_id)
      .getIn(path as [string, string, string, string, string])
  );

  React.useEffect(() => {
    const store = redux.getProjectStore(project_id);
    let last_value = value;
    const f = (obj) => {
      if (!f.is_mounted) return; // see comment for useReduxNamedStore
      const new_value = obj.getIn(path);
      if (last_value !== new_value) {
        /*
        console.log("useReduxProjectStore change ", {
          path: JSON.stringify(path),
          new_value,
          last_value,
        });
        */
        last_value = new_value;
        set_value(new_value);
      }
    };
    f.is_mounted = true;
    store.on("change", f);
    return () => {
      f.is_mounted = false;
      store.removeListener("change", f);
    };
  }, []);

  return value;
}

function useReduxEditorStore(
  path: string[],
  project_id: string,
  filename: string,
  is_public?: boolean
) {
  const [value, set_value] = React.useState(() =>
    // the editor itself might not be defined hence the ?. below:
    redux
      .getEditorStore(project_id, filename, is_public)
      ?.getIn(path as [string, string, string, string, string])
  );

  React.useEffect(() => {
    let store = redux.getEditorStore(project_id, filename, is_public);
    let last_value = value;
    const f = (obj) => {
      if (!f.is_mounted) return; // see comment for useReduxNamedStore
      const new_value = obj.getIn(path);
      if (last_value !== new_value) {
        last_value = new_value;
        set_value(new_value);
      }
    };
    f.is_mounted = true;
    if (store != null) {
      store.on("change", f);
    } else {
      /* This code is extra complicated since we account for the case
         when getEditorStore is undefined then becomes defined.
         Very rarely there are components that useRedux and somehow
         manage to do so before the editor store gets created.
         NOTE: I might be able to solve this same problem with
         simpler code with useAsyncEffect...
      */
      const g = () => {
        if (!f.is_mounted) {
          unsubscribe();
          return;
        }
        store = redux.getEditorStore(project_id, filename, is_public);
        if (store != null) {
          unsubscribe();
          f(store); // may have missed an initial change
          store.on("change", f);
        }
      };
      const unsubscribe = redux._redux_store.subscribe(g);
    }

    return () => {
      f.is_mounted = false;
      store?.removeListener("change", f);
    };
  }, []);

  return value;
}

export function useRedux(
  path: string[],
  project_id?: string,
  filename?: string, // for editing a file in project
  is_public?: boolean
) {
  if (project_id == null) {
    return useReduxNamedStore(path);
  }
  if (filename == null) {
    return useReduxProjectStore(path, project_id);
  }
  return useReduxEditorStore(path, project_id, filename, is_public);
}

/*
Hook to get the actions associated to a named actions/store,
a project, or an editor.  If the first argument is a uuid,
then it's the project actions or editor actions; otherwise,
it's one of the other named actions or undefined.
*/

export function useActions(name: "account"): types.AccountActions;
export function useActions(name: "projects"): types.ProjectsActions;
export function useActions(name: "billing"): types.BillingActions;
export function useActions(name: "page"):  types.PageActions;
export function useActions(name: "support"): types.SupportActions;
export function useActions(name: "admin-users"): types.AdminUsersActions;
export function useActions(
  name: "admin-site-licenses"
): types.SiteLicensesActions;
export function useActions(name: "mentions"): types.MentionsActions;
export function useActions(name: "file_use"): types.FileUseActions; // or undefined?

// If it is none of the explicitly named ones... it's a project.
export function useActions(name_or_project_id: string): ProjectActions;

// Or an editor actions (any for now)
export function useActions(name_or_project_id: string, path: string): any;

export function useActions(name_or_project_id: string, path?: string) {
  return React.useMemo(() => {
    if (path == null) {
      if (is_valid_uuid_string(name_or_project_id)) {
        return redux.getProjectActions(name_or_project_id);
      } else {
        return redux.getActions(name_or_project_id);
      }
    } else {
      const actions = redux.getEditorActions(name_or_project_id, path);
      if (actions == null) {
        throw Error(`BUG: actions for "${path}" must be defined but is not`);
      }
      return actions;
    }
  }, [name_or_project_id, path]);
}

export function useStore(name: "account"): types.AccountStore;
export function useStore(name: "projects"): types.ProjectsStore;
export function useStore(name: "billing"): types.BillingStore;
export function useStore(name: "page"): types.PageStore;
export function useStore(name: "support"): types.SupportStore;
export function useStore(name: "admin-users"): types.AdminUsersStore;
export function useStore(name: "admin-site-licenses"): types.SiteLicensesStore;
export function useStore(name: "mentions"): types.MentionsStore;
export function useStore(name: "file_use"): types.FileUseStore;
// If it is none of the explicitly named ones... it's a project.
export function useStore(name_or_project_id: string): ProjectStore;
// Or an editor store (any for now)
export function useStore(name_or_project_id: string, path: string): any;
export function useStore(name_or_project_id: string, path?: string): any {
  return React.useMemo(() => {
    if (path == null) {
      if (is_valid_uuid_string(name_or_project_id)) {
        return redux.getProjectStore(name_or_project_id);
      } else {
        return redux.getStore(name_or_project_id);
      }
    } else {
      return redux.getEditorStore(name_or_project_id, path);
    }
  }, [name_or_project_id, path]) as any;
}
