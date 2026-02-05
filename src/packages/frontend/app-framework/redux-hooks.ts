/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Overview
--------
This file defines the core React hooks for reading Redux-like stores in the
frontend. There are three usage shapes:

1) Named/global store:
   const accountId = useRedux(["account", "account_id"]);

2) Project store:
   const title = useRedux(["settings", "title"], projectId);

3) Editor store in a project:
   const cursor = useRedux(["cursor"], projectId, path);

Typed hook wrapper:
  const projectState = useTypedRedux({ project_id: projectId }, "status");
  const pageState = useTypedRedux("page", "current_tab");

Editor selector hook:
  const useEditor = useEditorRedux<MyEditorState>({ project_id, path });
  const tasks = useEditor("tasks");
  const pages = useEditor("pages");

If the store name is not yet known, you may use "" to get undefined:
  useRedux(["", "whatever"]) === undefined

Implementation Notes
--------------------
- All hooks are called unconditionally and keep a stable order to satisfy
  react-hooks/rules-of-hooks.
- Subscriptions listen to the store "change" event and compare values by
  reference. Immutable stores are expected to update references on changes.
- useRedux normalizes arguments into a tagged target and uses a single
  subscription path.
- useEditorRedux returns a selector function that tracks which fields were
  read during render and only re-renders when those fields change. This keeps
  hook usage valid while preserving per-field change detection.
*/

import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import {
  ProjectActions,
  ProjectStore,
  redux,
} from "@cocalc/frontend/app-framework";
import * as types from "@cocalc/frontend/app-framework/actions-and-stores";
import { ProjectStoreState } from "@cocalc/frontend/project_store";
import { is_valid_uuid_string } from "@cocalc/util/misc";

export interface StoreStates {
  account: types.AccountState;
  "admin-site-licenses": types.SiteLicensesState;
  "admin-users": types.AdminUsersState;
  billing: types.BillingState;
  compute_images: types.ComputeImagesState;
  customize: types.CustomizeState;
  file_use: types.FileUseState;
  mentions: types.MentionsState;
  messages: types.MessagesState;
  page: types.PageState;
  projects: types.ProjectsState;
  users: types.UsersState;
  news: types.NewsState;
}

/**
 * Typed wrapper around useRedux.
 *
 * Use this for safer typing when possible. The overloads enforce which
 * store is being accessed and the field name within that store.
 *
 * Examples:
 *   const pageTab = useTypedRedux("page", "current_tab");
 *   const status = useTypedRedux({ project_id }, "status");
 */
export function useTypedRedux<
  T extends keyof StoreStates,
  S extends keyof StoreStates[T],
>(store: T, field: S): StoreStates[T][S];

export function useTypedRedux<S extends keyof ProjectStoreState>(
  project_id: { project_id: string },
  field: S,
): ProjectStoreState[S];

export function useTypedRedux(
  a: keyof StoreStates | { project_id: string },
  field: string,
) {
  const path = typeof a === "string" ? a : a.project_id;
  return useRedux(path, field);
}

/**
 * Read a field from an editor store regardless of the underlying store API.
 *
 * This supports Immutable-style stores that expose getIn/get, as well as
 * plain object stores. It returns undefined for missing stores/fields.
 */
function getEditorFieldValue(store: any, field: string) {
  if (store == null) return undefined;
  if (typeof store.getIn === "function") {
    return store.getIn([field]);
  }
  if (typeof store.get === "function") {
    return store.get(field);
  }
  return store[field];
}

/**
 * Hook that returns a selector for editor store fields.
 *
 * The returned function is NOT a hook. Call it during render to read fields
 * and to register which fields this component depends on.
 *
 * Example:
 *   const useEditor = useEditorRedux<MyEditorState>({ project_id, path });
 *   const tasks = useEditor("tasks");
 *   const pages = useEditor("pages");
 *
 * Implementation details:
 * - Tracks fields read during render (renderFieldsRef).
 * - After render (useLayoutEffect), snapshots those fields into
 *   trackedFieldsRef and caches their latest values.
 * - A single store subscription compares only tracked fields and triggers
 *   a re-render when any of them changes.
 * - Handles editor store creation being delayed by subscribing to the
 *   global redux store until the editor store exists.
 */
export function useEditorRedux<State>(editor: {
  project_id: string;
  path: string;
}) {
  const [, forceRender] = React.useState(0);
  const storeRef = useRef<any>(
    redux.getEditorStore(editor.project_id, editor.path),
  );
  const trackedFieldsRef = useRef<Set<string>>(new Set());
  const lastValuesRef = useRef<Map<string, any>>(new Map());
  const renderFieldsRef = useRef<Set<string>>(new Set());
  const editorKeyRef = useRef<string>("");

  const editorKey = `${editor.project_id}:${editor.path}`;
  if (editorKeyRef.current !== editorKey) {
    editorKeyRef.current = editorKey;
    trackedFieldsRef.current = new Set();
    lastValuesRef.current = new Map();
  }

  storeRef.current = redux.getEditorStore(editor.project_id, editor.path);
  renderFieldsRef.current = new Set();

  const selectField = useCallback(<S extends keyof State>(field: S) => {
    renderFieldsRef.current.add(field as string);
    return getEditorFieldValue(storeRef.current, field as string) as State[S];
  }, []);

  useLayoutEffect(() => {
    const fields = renderFieldsRef.current;
    trackedFieldsRef.current = fields;
    const store = storeRef.current;
    const lastValues = lastValuesRef.current;
    for (const field of Array.from(lastValues.keys())) {
      if (!fields.has(field)) {
        lastValues.delete(field);
      }
    }
    if (store != null) {
      for (const field of fields) {
        lastValues.set(field, getEditorFieldValue(store, field));
      }
    }
  });

  useEffect(() => {
    let store = redux.getEditorStore(editor.project_id, editor.path);
    storeRef.current = store;
    let is_mounted = true;
    let unsubscribe: (() => void) | undefined;

    const update = (obj) => {
      if (obj == null || !is_mounted) return;
      storeRef.current = obj;
      const fields = trackedFieldsRef.current;
      if (fields.size === 0) return;
      let changed = false;
      const lastValues = lastValuesRef.current;
      for (const field of fields) {
        const newValue = getEditorFieldValue(obj, field);
        if (lastValues.get(field) !== newValue) {
          lastValues.set(field, newValue);
          changed = true;
        }
      }
      if (changed) {
        forceRender((version) => version + 1);
      }
    };

    if (store != null) {
      store.on("change", update);
      update(store);
    } else {
      const g = () => {
        if (!is_mounted) {
          unsubscribe?.();
          return;
        }
        store = redux.getEditorStore(editor.project_id, editor.path);
        if (store != null) {
          unsubscribe?.();
          storeRef.current = store;
          update(store); // may have missed an initial change
          store.on("change", update);
        }
      };
      unsubscribe = redux.reduxStore.subscribe(g);
    }

    return () => {
      is_mounted = false;
      store?.removeListener("change", update);
      unsubscribe?.();
    };
  }, [editor.project_id, editor.path]);

  return selectField;
}

type ReduxTarget =
  | { kind: "named"; path: string[] }
  | { kind: "project"; path: string[]; project_id: string }
  | { kind: "editor"; path: string[]; project_id: string; filename: string };

/**
 * Normalize useRedux arguments into a tagged target.
 *
 * Rules:
 * - String path + string project_id => named store or project store
 * - Array path + project_id => project store (if uuid) or named store
 * - Array path + project_id + filename => editor store
 */
function normalizeReduxArgs(
  path: string | string[],
  project_id?: string,
  filename?: string,
): ReduxTarget {
  if (typeof path === "string") {
    // good typed version!! -- path specifies store
    if (typeof project_id !== "string" || typeof filename !== "undefined") {
      throw Error(
        "if first argument of useRedux is a string then second argument must also be and no other arguments can be specified",
      );
    }
    if (is_valid_uuid_string(path)) {
      return { kind: "project", path: [project_id], project_id: path };
    }
    return { kind: "named", path: [path, project_id] };
  }
  if (project_id == null) {
    return { kind: "named", path };
  }
  if (filename == null) {
    if (!is_valid_uuid_string(project_id)) {
      // this is used a lot by frame-tree editors right now.
      return { kind: "named", path: [project_id].concat(path) };
    }
    return { kind: "project", path, project_id };
  }
  return { kind: "editor", path, project_id, filename };
}

/**
 * Read the current snapshot for a normalized target.
 *
 * This does not subscribe; it is used for initial state and for comparing
 * store updates inside the subscription.
 */
function getReduxValue(target: ReduxTarget) {
  if (target.kind === "named") {
    if (target.path[0] === "") {
      return undefined;
    }
    return redux.getStore(target.path[0])?.getIn(target.path.slice(1) as any);
  }
  if (target.kind === "project") {
    return redux
      .getProjectStore(target.project_id)
      .getIn(target.path as [string, string, string, string, string]);
  }
  return redux
    .getEditorStore(target.project_id, target.filename)
    ?.getIn(target.path as [string, string, string, string, string]);
}

/**
 * General-purpose hook to read values from named stores, project stores, or
 * editor stores. The hook decides which store to subscribe to based on the
 * argument shape (see examples below).
 *
 * Examples:
 *   const userName = useRedux(["account", "full_name"]);
 *   const status = useRedux(["status"], projectId);
 *   const cursor = useRedux(["cursor"], projectId, path);
 *   const maybe = useRedux(["", "unknown"]) // => undefined
 *
 * Implementation details:
 * - Arguments are normalized to a target so hooks are not called conditionally.
 * - A single useEffect subscribes to the correct store based on target.kind.
 * - Updates compare by reference; immutable stores should update references.
 */
export function useRedux(
  path: string | string[],
  project_id?: string,
  filename?: string,
) {
  const target = normalizeReduxArgs(path, project_id, filename);
  // Stable key: normalizeReduxArgs creates a deterministic shape for JSON.stringify.
  const targetKey = JSON.stringify(target);
  const [value, set_value] = React.useState(() => getReduxValue(target));

  useEffect(() => {
    let store: any;
    let last_value = getReduxValue(target);
    let is_mounted = true;
    set_value(last_value);

    const update = (obj) => {
      if (obj == null || !is_mounted) return;
      const subpath =
        target.kind === "named" ? target.path.slice(1) : target.path;
      const new_value = obj.getIn(subpath as any);
      if (last_value !== new_value) {
        last_value = new_value;
        set_value(new_value);
      }
    };

    if (target.kind === "named") {
      if (target.path[0] === "") {
        return () => {
          is_mounted = false;
        };
      }
      store = redux.getStore(target.path[0]);
      if (store == null) {
        console.warn(
          `store "${target.path[0]}" must exist; path=`,
          target.path,
        );
        return () => {
          is_mounted = false;
        };
      }
      store.on("change", update);
      update(store);
      return () => {
        is_mounted = false;
        store?.removeListener("change", update);
      };
    }

    if (target.kind === "project") {
      store = redux.getProjectStore(target.project_id);
      store.on("change", update);
      update(store);
      return () => {
        is_mounted = false;
        store?.removeListener("change", update);
      };
    }

    let editorStore = redux.getEditorStore(target.project_id, target.filename);
    const f = (obj) => {
      if (obj == null || !is_mounted) return;
      const new_value = obj.getIn(target.path);
      if (last_value !== new_value) {
        last_value = new_value;
        set_value(new_value);
      }
    };
    f(editorStore);
    if (editorStore != null) {
      editorStore.on("change", f);
    } else {
      const g = () => {
        if (!is_mounted) {
          unsubscribe();
          return;
        }
        editorStore = redux.getEditorStore(target.project_id, target.filename);
        if (editorStore != null) {
          unsubscribe();
          f(editorStore); // may have missed an initial change
          editorStore.on("change", f);
        }
      };
      const unsubscribe = redux.reduxStore.subscribe(g);
    }

    return () => {
      is_mounted = false;
      editorStore?.removeListener("change", f);
    };
  }, [targetKey]);

  return value;
}

/**
 * Hook to get actions for a named store, a project, or an editor.
 *
 * Examples:
 *   const actions = useActions("projects");
 *   const actions = useActions({ project_id });
 *   const editorActions = useActions(projectId, path);
 *
 * Notes:
 * - Named actions must exist; missing named actions throw an error.
 * - Project actions can be undefined while a project is closing.
 */

export function useActions(name: "account"): types.AccountActions;
export function useActions(
  name: "admin-site-licenses",
): types.SiteLicensesActions;
export function useActions(name: "admin-users"): types.AdminUsersActions;
export function useActions(name: "billing"): types.BillingActions;
export function useActions(name: "file_use"): types.FileUseActions;
export function useActions(name: "mentions"): types.MentionsActions;
export function useActions(name: "messages"): types.MessagesActions;
export function useActions(name: "page"): types.PageActions;
export function useActions(name: "projects"): types.ProjectsActions;
export function useActions(name: "users"): types.UsersActions;
export function useActions(name: "news"): types.NewsActions;
export function useActions(name: "customize"): types.CustomizeActions;

// If it is none of the explicitly named ones... it's a project or just some general actions.
// That said *always* use {project_id} as below to get the actions for a project, so you
// get proper typing.
export function useActions(x: string): any;

export function useActions<T>(x: { name: string }): T;

// Return type includes undefined because the actions for a project *do* get
// destroyed when closing a project, and rendering can still happen during this
// time, so client code must account for this.
export function useActions(x: {
  project_id: string;
}): ProjectActions | undefined;

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
import { Store } from "@cocalc/util/redux/Store";
import { isEqual } from "lodash";
export interface Stores {
  account: types.AccountStore;
  "admin-site-licenses": types.SiteLicensesStore;
  "admin-users": types.AdminUsersStore;
  billing: types.BillingStore;
  compute_images: types.ComputeImagesStore;
  customize: types.CustomizeStore;
  file_use: types.FileUseStore;
  mentions: types.MentionsStore;
  messages: types.MessagesStore;
  page: types.PageStore;
  projects: types.ProjectsStore;
  users: types.UsersStore;
  news: types.NewsStore;
}

// If it is none of the explicitly named ones... it's a project.
//export function useStore(name: "projects"): types.ProjectsStore;
/**
 * Hook to get a store instance (named or project).
 *
 * Examples:
 *   const store = useStore("projects");
 *   const store = useStore({ project_id });
 *
 * Throws if the store is not defined.
 */
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

/**
 * Debug hook that logs which props changed between renders.
 *
 * Uses deep equality (lodash isEqual) to detect changes and logs a map of
 * keys to [previous, next] values.
 */
export function useTraceUpdate(props) {
  const prev = useRef(props);
  useEffect(() => {
    const changedProps = Object.entries(props).reduce((ps, [k, v]) => {
      if (!isEqual(prev.current[k], v)) {
        ps[k] = [prev.current[k], v];
      }
      return ps;
    }, {});
    if (Object.keys(changedProps).length > 0) {
      console.log("Changed props:", changedProps);
    }
    prev.current = props;
  });
}
