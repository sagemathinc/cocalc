/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*

**IMPORTANT:** TYPED REDUX HOOKS -- If you use

        useTypedRedux('name' | {project_id:'the project id'}, 'one field')

then you will get good guaranteed typing (unless, of course, the global store
hasn't been converted to typescript yet!). If you use plain useRedux, you
get a dangerous "any" type out!

---

Hook for getting anything from our global redux store, and this should
also work fine with computed properties.

Use it is as follows:

With a named store, such as "projects", "account", "page", etc.:

 useRedux(['name-of-store', 'path', 'in', 'store'])

With a specific project:

 useRedux(['path', 'in', 'project store'], 'project-id')

Or with an editor in a project:

 useRedux(['path', 'in', 'project store'], 'project-id', 'path')

If you don't know the name of the store initially, you can use a name of '',
and you'll always get back undefined.

 useRedux(['', 'other', 'stuff']) === undefined
*/

import { is_valid_uuid_string } from "@cocalc/util/misc";
import { redux, ProjectActions, ProjectStore } from "../app-framework";
import { ProjectStoreState } from "../project_store";
import React from "react";
import * as types from "./actions-and-stores";

export function useReduxNamedStore(path: string[]) {
  const [value, set_value] = React.useState(() => {
    return redux.getStore(path[0])?.getIn(path.slice(1) as any) as any;
  });

  React.useEffect(() => {
    if (path[0] == "") {
      // Special case -- we allow passing "" for the name of the store and get out undefined.
      // This is useful when using the useRedux hook but when the name of the store isn't known initially.
      return undefined;
    }
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

export interface StoreStates {
  account: types.AccountState;
  "admin-site-licenses": types.SiteLicensesState;
  "admin-users": types.AdminUsersState;
  billing: types.BillingState;
  compute_images: types.ComputeImagesState;
  customize: types.CustomizeState;
  file_use: types.FileUseState;
  mentions: types.MentionsState;
  page: types.PageState;
  projects: types.ProjectsState;
  users: types.UsersState;
  "compute-environment": types.ComputeEnvironmentState;
}

export function useTypedRedux<
  T extends keyof StoreStates,
  S extends keyof StoreStates[T]
>(store: T, field: S): StoreStates[T][S];

export function useTypedRedux<S extends keyof ProjectStoreState>(
  project_id: { project_id: string },
  field: S
): ProjectStoreState[S];

export function useTypedRedux(
  a: keyof StoreStates | { project_id: string },
  field: string
) {
  if (typeof a == "string") {
    return useRedux(a, field);
  }
  return useRedux(a.project_id, field);
}

export function useEditorRedux<State>(editor: {
  project_id: string;
  path: string;
}) {
  function f<S extends keyof State>(field: S): State[S] {
    return useReduxEditorStore(
      [field as string],
      editor.project_id,
      editor.path
    ) as any;
  }
  return f;
}

/*
export function useEditorRedux<State, S extends keyof State>(editor: {
  project_id: string;
  path: string;
}): State[S] {
  return useReduxEditorStore(
    [S as string],
    editor.project_id,
    editor.path
  ) as any;
}
*/
/*
export function useEditorRedux(
  editor: { project_id: string; path: string },
  field
): any {
  return useReduxEditorStore(
    [field as string],
    editor.project_id,
    editor.path
  ) as any;
}
*/

export function useRedux(
  path: string | string[],
  project_id?: string,
  filename?: string,
  is_public?: boolean
) {
  if (typeof path == "string") {
    // good typed version!! -- path specifies store
    if (
      typeof project_id != "string" ||
      typeof filename != "undefined" ||
      typeof is_public != "undefined"
    ) {
      throw Error(
        "if first argument of useRedux is a string then second argument must also be and no other arguments can be specified"
      );
    }
    if (is_valid_uuid_string(path)) {
      return useRedux([project_id], path);
    } else {
      return useRedux([path, project_id]);
    }
  }
  if (project_id == null) {
    return useReduxNamedStore(path);
  }
  if (filename == null) {
    if (!is_valid_uuid_string(project_id)) {
      // this is used a lot by frame-tree editors right now.
      return useReduxNamedStore([project_id].concat(path));
    } else {
      return useReduxProjectStore(path, project_id);
    }
  }
  return useReduxEditorStore(path, project_id, filename, is_public);
}

/*
Hook to get the actions associated to a named actions/store,
a project, or an editor.  If the first argument is a uuid,
then it's the project actions or editor actions; otherwise,
it's one of the other named actions or undefined.
*/

// TODO: very incomplete -- might not even work.
/*
export interface ActionsTypes {
  account: types.AccountActions;
  "admin-site-licenses": types.SiteLicensesActions;
  "admin-users": types.AdminUsersActions;
  billing: types.BillingActions;
  compute_images: types.ComputeImagesActions;
  customize: types.CustomizeActions;
  file_use: types.FileUseActions;
  mentions: types.MentionsActions;
  page: types.PageActions;
  projects: types.ProjectsActions;
  users: types.UsersActions;
}

*/

export function useActions(name: "account"): types.AccountActions;
export function useActions(
  name: "admin-site-licenses"
): types.SiteLicensesActions;
export function useActions(name: "admin-users"): types.AdminUsersActions;
export function useActions(name: "billing"): types.BillingActions;
export function useActions(name: "file_use"): types.FileUseActions;
export function useActions(name: "mentions"): types.MentionsActions;
export function useActions(name: "page"): types.PageActions;
export function useActions(name: "projects"): types.ProjectsActions;
export function useActions(name: "users"): types.UsersActions;
export function useActions(
  name: "compute-environment"
): types.ComputeEnvironmentActions;

// If it is none of the explicitly named ones... it's a project or just some general actions.
// That said *always* use {project_id} as below to get the actions for a project, so you
// get proper typing.
export function useActions(x: string): any;

export function useActions<T>({ name: string }): T;

// Return type includes undefined because the actions for a project *do* get
// destroyed when closing a project, and rendering can still happen during this
// time, so client code must account for this.
export function useActions({ project_id: string }): ProjectActions | undefined;

// Or an editor actions (any for now)
export function useActions(x: string, path: string): any;

export function useActions(x, path?: string) {
  return React.useMemo(() => {
    let actions;
    if (path != null) {
      actions = redux.getEditorActions(x, path);
    } else {
      if (x?.name != null) {
        actions = redux.getActions(x.name);
      } else if (x?.project_id != null) {
        // return here to avoid null check below; it can be null
        return redux.getProjectActions(x.project_id);
      } else if (is_valid_uuid_string(x)) {
        // return here to avoid null check below; it can be null
        return redux.getProjectActions(x);
      } else {
        actions = redux.getActions(x);
      }
    }
    if (actions == null) {
      throw Error(`BUG: actions for "${path}" must be defined but is not`);
    }
    return actions;
  }, [x, path]);
}

// WARNING: I tried to define this Stores interface
// in actions-and-stores.ts but it did NOT work. All
// the types just became any or didn't match.  Don't
// move this unless you also fully test it!!
import { Store } from "./Store";
export interface Stores {
  account: types.AccountStore;
  "admin-site-licenses": types.SiteLicensesStore;
  "admin-users": types.AdminUsersStore;
  billing: types.BillingStore;
  compute_images: types.ComputeImagesStore;
  customize: types.CustomizeStore;
  file_use: types.FileUseStore;
  mentions: types.MentionsStore;
  page: types.PageStore;
  projects: types.ProjectsStore;
  users: types.UsersStore;
  "compute-environment": types.ComputeEnvironmentStore;
}

// If it is none of the explicitly named ones... it's a project.
//export function useStore(name: "projects"): types.ProjectsStore;
export function useStore<T extends keyof Stores>(name: T): Stores[T];
export function useStore(x: { project_id: string }): ProjectStore;
export function useStore<T>(x: { name: string }): T;
// Or an editor store (any for now):
//export function useStore(project_id: string, path: string): Store<any>;
export function useStore(x): any {
  return React.useMemo(() => {
    let store;
    if (x?.project_id != null) {
      store = redux.getProjectStore(x.project_id);
    } else if (x?.name != null) {
      store = redux.getStore(x.name);
    } else if (is_valid_uuid_string(x)) {
      store = redux.getProjectStore(x);
    } else {
      store = redux.getStore(x);
    }
    if (store == null) {
      throw Error("store must be defined");
    }
    return store;
  }, [x]) as Store<any>;
}
