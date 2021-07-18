/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Not sure where this should go...
declare global {
  interface Window {
    app_base_path: string;
    Primus: any;
  }
}

// Important: code below now assumes that a global variable called "DEBUG" is **defined**!
declare var DEBUG: boolean;
if (DEBUG == null) {
  var DEBUG = false;
}

let rclass: <P extends object>(
  Component: React.ComponentType<P>
) => React.ComponentType<P>;

import * as immutable from "immutable";
import * as React from "react";
import { createStore as createReduxStore } from "redux";
import * as createReactClass from "create-react-class";
import { Provider, connect, useSelector } from "react-redux";
import * as json_stable from "json-stable-stringify";

import { Store, StoreConstructorType } from "./Store";
import { Actions } from "./Actions";
import { Table, TableConstructor } from "./Table";

// Relative import is temporary, until I figure this out -- needed for *project*
import { bind_methods, keys, is_valid_uuid_string } from "smc-util/misc";

export { TypedMap, createTypedMap } from "./TypedMap";

import { NAME_TYPE as ComputeImageStoreType } from "../custom-software/util";

import * as types from "./actions-and-stores";
declare type ProjectStore = import("../project_store").ProjectStore;
declare type ProjectActions = import("../project_actions").ProjectActions;
export { ProjectStore, ProjectActions };

const action_set_state = function (change) {
  return {
    type: "SET_STATE",
    change: immutable.fromJS(change), // guaranteed immutable.js all the way down
  };
};
// Deeply nested objects need to be converted with fromJS before being put in the store

const action_remove_store = function (name) {
  return {
    type: "REMOVE_STORE",
    name,
  };
};

type redux_state = immutable.Map<string, immutable.Map<string, any>>;

const redux_app = function (state: redux_state, action): redux_state {
  if (state == null) {
    return immutable.Map();
  }
  switch (action.type) {
    case "SET_STATE":
      // Typically action.change has exactly one key, the name of a Store.
      // We merge in what is in action.change[name] to state[name] below.
      action.change.map(function (val, store) {
        let new_val;
        const old_val = state.get(store);
        if (old_val !== undefined) {
          new_val = old_val.merge(val);
        }
        return (state = state.set(store, new_val || val));
      });
      return state;
    case "REMOVE_STORE":
      return state.delete(action.name);
    default:
      return state;
  }
};

interface ClassMap<T extends C, C> {
  [key: string]: T;
}

export class AppRedux {
  public _redux_store: any;
  private _tables: ClassMap<any, Table>;
  private _stores: ClassMap<any, Store<any>>;
  private _actions: ClassMap<any, Actions<any>>;
  private _last_state: redux_state;
  private changed_stores: Set<string> = new Set([]);

  constructor() {
    bind_methods(this);
    this._tables = {};
    this._redux_store = createReduxStore(redux_app);
    this._stores = {};
    this._actions = {};
    this._redux_store.subscribe(this._redux_store_change);
  }

  // Only used by tests to completely reset the global redux instance
  __reset(): void {
    this.changed_stores.clear();
    this._tables = {};
    this._redux_store = createReduxStore(redux_app);
    this._stores = {};
    this._actions = {};
    this._redux_store.subscribe(this._redux_store_change);
  }

  _redux_store_change(): void {
    const state = this._redux_store.getState();
    if (this._last_state == null) {
      this._last_state = immutable.Map();
    }
    for (const name of this.changed_stores) {
      const store = this._stores[name];
      if (store == null) continue;
      const s = state.get(name);
      if (this._last_state.get(name) !== s) {
        store._handle_store_change(s);
      }
    }
    this.changed_stores.clear();
  }

  show_state(): void {
    console.log(JSON.stringify(this._redux_store.getState().toJS()));
  }

  // Returns a function which cancels logging state
  log_states(): () => void {
    return this._redux_store.subscribe(this.show_state);
  }

  _set_state(change, store_name: string): void {
    this.changed_stores.add(store_name);
    this._redux_store.dispatch(action_set_state(change));
  }

  createActions<T, C extends Actions<T>>(
    name: string,
    actions_class?: new (a, b) => C
  ): C {
    if (name == null) {
      throw Error("name must be a string");
    }

    if (this._actions[name] == null) {
      if (actions_class === undefined) {
        this._actions[name] = new Actions(name, this);
      } else {
        this._actions[name] = new actions_class(name, this);
      }
    }

    return this._actions[name];
  }

  hasActions(name: string): boolean {
    return !!this._actions[name];
  }

  getActions(name: "account"): types.AccountActions;
  getActions(name: "projects"): types.ProjectsActions;
  getActions(name: "billing"): types.BillingActions;
  getActions(name: "page"): types.PageActions;
  getActions(name: "users"): types.UsersActions;
  getActions(name: "support"): types.SupportActions;
  getActions(name: "admin-users"): types.AdminUsersActions;
  getActions(name: "admin-site-licenses"): types.SiteLicensesActions;
  getActions(name: "mentions"): types.MentionsActions;
  getActions(name: "file_use"): types.FileUseActions;
  getActions(name: { project_id: string }): ProjectActions;
  getActions<T, C extends Actions<T>>(name: string): C;
  getActions<T, C extends Actions<T>>(
    name: string | { project_id: string }
  ): C | ProjectActions | undefined {
    if (typeof name === "string") {
      if (!this.hasActions(name)) {
        return undefined;
      } else {
        return this._actions[name];
      }
    } else {
      if (name.project_id == null) {
        throw Error("Object must have project_id attribute");
      }
      return this.getProjectActions(name.project_id);
    }
  }

  createStore<State, C extends Store<State> = Store<State>>(
    name: string,
    store_class?: StoreConstructorType<State, C>,
    init?: {} | State
  ): C {
    let S: C = this._stores[name];
    if (S != null) throw Error(`store ${name} already exists`);
    if (init === undefined && typeof store_class !== "function") {
      // so can do createStore(name, {default init})
      init = store_class;
      store_class = undefined;
    }
    if (S == null) {
      if (store_class === undefined) {
        (S as any) = this._stores[name] = new Store(name, this);
      } else {
        S = this._stores[name] = new store_class(name, this);
      }
      // Put into store. WARNING: New set_states CAN OVERWRITE THESE FUNCTIONS
      let C = immutable.Map(S as {});
      C = C.delete("redux"); // No circular pointing
      this._set_state({ [name]: C }, name);
    }
    if (typeof S.getInitialState === "function") {
      init = S.getInitialState();
    }
    if (init != null) {
      this._set_state({ [name]: init }, name);
    }
    return S;
  }

  hasStore(name: string): boolean {
    return !!this._stores[name];
  }

  getStore(name: "account"): types.AccountStore;
  getStore(name: "projects"): types.ProjectsStore;
  getStore(name: "billing"): types.BillingStore;
  getStore(name: "page"): types.PageStore;
  getStore(name: "support"): types.SupportStore;
  getStore(name: "admin-users"): types.AdminUsersStore;
  getStore(name: "admin-site-licenses"): types.SiteLicensesStore;
  getStore(name: "mentions"): types.MentionsStore;
  getStore(name: "file_use"): types.FileUseStore;
  getStore(name: "customize"): types.CustomizeStore;
  getStore(name: "users"): types.UsersStore;
  getStore(name: ComputeImageStoreType): types.ComputeImagesStore;

  getStore<State>(name: string): Store<State>;
  getStore<State, C extends Store<State>>(nam: string): C | undefined;
  //  getStore<State, C extends Store<State>>(name: string): C | undefined
  getStore(name) {
    if (!this.hasStore(name)) {
      return undefined;
    }
    return this._stores[name];
  }

  createTable<T extends Table>(
    name: string,
    table_class: TableConstructor<T>
  ): T {
    const tables = this._tables;
    if (tables[name] != null) {
      throw Error(`createTable: table "${name}" already exists`);
    }
    const table = new table_class(name, this);
    return (tables[name] = table);
  }

  // Set the table; we assume that the table being overwritten
  // has been cleaned up properly somehow...
  setTable(name: string, table: Table): void {
    this._tables[name] = table;
  }

  removeTable(name: string): void {
    if (this._tables[name] != null) {
      if (this._tables[name]._table != null) {
        this._tables[name]._table.close();
      }
      delete this._tables[name];
    }
  }

  removeStore(name: string): void {
    if (this._stores[name] != null) {
      const S = this._stores[name];
      S.emit("destroy");
      delete this._stores[name];
      S.removeAllListeners();
      this._redux_store.dispatch(action_remove_store(name));
    }
  }

  removeActions(name: string): void {
    if (this._actions[name] != null) {
      const A = this._actions[name];
      delete this._actions[name];
      // NOTE: even if A is defined, destroy might not be... due to our
      // aggressive close function:
      A?.destroy?.();
    }
  }

  getTable<T extends Table>(name: string): T {
    if (this._tables[name] == null) {
      throw Error(`getTable: table "${name}" not registered`);
    }
    return this._tables[name];
  }

  hasProjectStore(project_id: string): boolean {
    return this.hasStore(project_redux_name(project_id));
  }

  /**
   * A React Hook to connect a function component to a project store.
   * Opposed to `getProjectStore`, the project store will not initialize
   * if it's not defined already.
   *
   * @param selectFrom selector to run on the store.
   *    The result will be compared to the previous result to determine
   *    if the component should rerender
   * @param project_id id of the project to connect to
   */
  useProjectStore<T>(
    selectFrom: (store?: ProjectStore) => T,
    project_id?: string
  ): T {
    return useSelector<any, T>((_) => {
      let projectStore = undefined;
      if (project_id) {
        projectStore = this.getStore(project_redux_name(project_id)) as any;
      }
      return selectFrom(projectStore);
    });
  }

  // getProject... is safe to call any time. All structures will be created
  // if they don't exist
  getProjectStore = (project_id: string): ProjectStore => {
    if (!is_valid_uuid_string(project_id)) {
      console.trace();
      console.warn(`getProjectStore: INVALID project_id -- "${project_id}"`);
    }
    if (!this.hasProjectStore(project_id)) {
      // Right now importing project_store breaks the share server,
      // so we don't yet.
      return require("../project_store").init(project_id, this);
    } else {
      return this.getStore(project_redux_name(project_id)) as any;
    }
  };

  // TODO -- Typing: Type project Actions
  // T, C extends Actions<T>
  getProjectActions(project_id: string): ProjectActions {
    if (!is_valid_uuid_string(project_id)) {
      console.trace();
      console.warn(`getProjectActions: INVALID project_id -- "${project_id}"`);
    }
    if (!this.hasProjectStore(project_id)) {
      require("../project_store").init(project_id, this);
    }
    return this.getActions(project_redux_name(project_id)) as any;
  }

  // TODO -- Typing: Type project Table
  getProjectTable(project_id: string, name: string): any {
    if (!is_valid_uuid_string(project_id)) {
      console.trace();
      console.warn(`getProjectTable: INVALID project_id -- "${project_id}"`);
    }
    if (!this.hasProjectStore(project_id)) {
      require("../project_store").init(project_id, this);
    }
    return this.getTable(project_redux_name(project_id, name));
  }

  removeProjectReferences(project_id: string): void {
    if (!is_valid_uuid_string(project_id)) {
      console.trace();
      console.warn(
        `getProjectReferences: INVALID project_id -- "${project_id}"`
      );
    }
    const name = project_redux_name(project_id);
    const store = this.getStore(name);
    if (store && typeof store.destroy == "function") {
      store.destroy();
    }
    this.removeActions(name);
    this.removeStore(name);
  }

  getEditorStore(project_id: string, path: string, is_public?: boolean) {
    if (!is_valid_uuid_string(project_id)) {
      console.trace();
      console.warn(`getEditorStore: INVALID project_id -- "${project_id}"`);
    }
    return this.getStore(file_redux_name(project_id, path, is_public));
  }

  getEditorActions(project_id: string, path: string, is_public?: boolean) {
    if (!is_valid_uuid_string(project_id)) {
      console.trace();
      console.warn(`getEditorActions: INVALID project_id -- "${project_id}"`);
    }
    return this.getActions(file_redux_name(project_id, path, is_public));
  }

  // getEditorActions but for whatever editor  -- this is mainly meant to be used
  // from the console when debugging, e.g., smc.redux.currentEditorActions()
  public currentEditor(): {
    actions: Actions<any> | undefined;
    store: Store<any> | undefined;
  } {
    const project_id = this.getStore("page").get("active_top_tab");
    if (!is_valid_uuid_string(project_id)) {
      return { actions: undefined, store: undefined };
    }
    const store = this.getProjectStore(project_id);
    const tab = store.get("active_project_tab");
    if (!tab.startsWith("editor-")) {
      return { actions: undefined, store: undefined };
    }
    const path = tab.slice("editor-".length);
    return {
      actions: this.getEditorActions(project_id, path),
      store: this.getEditorStore(project_id, path),
    };
  }
}

const computed = (rtype) => {
  const clone = rtype.bind({});
  clone.is_computed = true;
  return clone;
};

const rtypes = require("smc-util/opts").types;

/*
Used by Provider to map app state to component props

rclass
    reduxProps:
        store_name :
            prop     : type

WARNING: If store not yet defined, then props will all be undefined for that store!  There
is no warning/error in this case.

*/
const connect_component = (spec) => {
  const map_state_to_props = function (state) {
    const props = {};
    if (state == null) {
      return props;
    }
    for (const store_name in spec) {
      if (store_name === "undefined") {
        // "undefined" gets turned into this string when making a common mistake
        console.warn("spec = ", spec);
        throw Error(
          "WARNING: redux spec is invalid because it contains 'undefined' as a key. " +
            JSON.stringify(spec)
        );
      }
      const info = spec[store_name];
      const store: Store<any> | undefined = redux.getStore(store_name);
      for (const prop in info) {
        var val;
        const type = info[prop];

        if (type == null) {
          throw Error(
            `ERROR invalid redux spec: no type info set for prop '${prop}' in store '${store_name}', ` +
              `where full spec has keys '${Object.keys(spec)}' ` +
              `-- e.g. rtypes.bool vs. rtypes.boolean`
          );
        }

        if (store == undefined) {
          val = undefined;
        } else {
          val = store.get(prop);
        }

        if (type.category === "IMMUTABLE") {
          props[prop] = val;
        } else {
          props[prop] =
            (val != null ? val.toJS : undefined) != null ? val.toJS() : val;
        }
      }
    }
    return props;
  };
  return connect(map_state_to_props);
};

/*

Takes an object to create a reactClass or a function which returns such an object.

Objects should be shaped like a react class save for a few exceptions:
x.reduxProps =
    redux_store_name :
        fields : value_type
        name   : type

x.actions must not be defined.

*/

// Uncomment (and also use below) for working on
// https://github.com/sagemathinc/cocalc/issues/4176
/*
function reduxPropsCheck(reduxProps: object) {
  for (let store in reduxProps) {
    const x = reduxProps[store];
    if (x == null) continue;
    for (let field in x) {
      if (x[field] == rtypes.object) {
        console.log(`WARNING: reduxProps object ${store}.${field}`);
      }
    }
  }
}
*/

function compute_cache_key(data: { [key: string]: any }): string {
  return json_stable(keys(data).sort());
}

rclass = function (x: any) {
  let C;
  if (typeof x === "function" && typeof x.reduxProps === "function") {
    // using an ES6 class *and* reduxProps...
    C = createReactClass({
      render() {
        if (this.cache0 == null) {
          this.cache0 = {};
        }
        const reduxProps = x.reduxProps(this.props);
        //reduxPropsCheck(reduxProps);
        const key = compute_cache_key(reduxProps);
        // console.log("ES6 rclass render", key);
        if (this.cache0[key] == null) {
          this.cache0[key] = connect_component(reduxProps)(x);
        }
        return React.createElement(
          this.cache0[key],
          this.props,
          this.props.children
        );
      },
    });
    return C;
  } else if (typeof x === "function") {
    // Creates a react class that wraps the eventual component.
    // It calls the generator function with props as a parameter
    // and caches the result based on reduxProps
    const cached = createReactClass({
      // This only caches per Component. No memory leak, but could be faster for multiple components with the same signature
      render() {
        if (this.cache == null) {
          this.cache = {};
        }
        // OPTIMIZATION: Cache props before generating a new key.
        // currently assumes making a new object is fast enough
        const definition = x(this.props);
        //reduxPropsCheck(definition.reduxProps);
        const key = compute_cache_key(definition.reduxProps);
        // console.log("function rclass render", key);

        if (definition.actions != null) {
          throw Error(
            "You may not define a method named actions in an rclass. This is used to expose redux actions"
          );
        }

        definition.actions = redux.getActions;

        if (this.cache[key] == null) {
          this.cache[key] = rclass(definition);
        } // wait.. is this even the slow part?

        return React.createElement(
          this.cache[key],
          this.props,
          this.props.children
        );
      },
    });

    return cached;
  } else {
    if (x.reduxProps != null) {
      // Inject the propTypes based on the ones injected by reduxProps.
      const propTypes = x.propTypes != null ? x.propTypes : {};
      for (const store_name in x.reduxProps) {
        const info = x.reduxProps[store_name];
        for (const prop in info) {
          const type = info[prop];
          if (type !== rtypes.immutable) {
            propTypes[prop] = type;
          } else {
            propTypes[prop] = rtypes.object;
          }
        }
      }
      x.propTypes = propTypes;
      //reduxPropsCheck(propTypes);
    }

    if (x.actions != null && x.actions !== redux.getActions) {
      throw Error(
        "You may not define a method named actions in an rclass. This is used to expose redux actions"
      );
    }

    x.actions = redux.getActions;

    C = createReactClass(x);
    if (x.reduxProps != null) {
      // Make the ones comming from redux get automatically injected, as long
      // as this component is in a heierarchy wrapped by <Redux>...</Redux>
      C = connect_component(x.reduxProps)(C);
    }
  }
  return C;
};

const redux = new AppRedux();

// Public interface
export function is_redux(obj) {
  return obj instanceof AppRedux;
}
export function is_redux_actions(obj) {
  return obj instanceof Actions;
}

// Canonical name to use for Redux store associated to a given project/path.
// TODO: this code is also in many editors -- make them all just use this.
export function redux_name(
  project_id: string,
  path: string,
  is_public?: boolean
) {
  if (is_public) {
    return `public-${project_id}-${path}`;
  } else {
    return `editor-${project_id}-${path}`;
  }
}

const file_redux_name = redux_name;

export function project_redux_name(project_id: string, name?: string): string {
  let s = `project-${project_id}`;
  if (name !== undefined) s += `-${name}`;
  return s;
}

export class Redux extends React.Component {
  render() {
    return React.createElement(
      Provider,
      { store: redux._redux_store },
      this.props.children
    );
  }
}

// The lines above are just the non-tsx version of this:
//<Provider store={redux._redux_store}>
//    {@props.children}
//</Provider>

export const Component = React.Component;
export type Rendered = React.ReactElement<any> | undefined;
export { rclass }; // use rclass to get access to reduxProps support
export { rtypes }; // has extra rtypes.immutable, needed for reduxProps to leave value as immutable
export { computed };
export { React };
export type CSS = React.CSSProperties;
export const { Fragment } = React;
export { redux }; // global redux singleton
export { Actions };
export { Table };
export { Store };
function UNSAFE_NONNULLABLE<T>(arg: T): NonNullable<T> {
  return arg as any;
}
export { UNSAFE_NONNULLABLE };

// I'm explicitly disabling using typing with ReactDOM on purpose,
// because it's basically impossibly to use, and I'll probably get
// rid of all uses of ReactDOM.findDOMNode anyways.
//import * as ReactDOM from "react-dom";
//export { ReactDOM };
export const ReactDOM = require("react-dom");

declare var cc;
if (DEBUG) {
  if (typeof cc !== "undefined" && cc !== null) {
    cc.redux = redux;
  } // for convenience in the browser (mainly for debugging)
}

/*
Given
spec =
    foo :
       bar : ...
       stuff : ...
    foo2 :
       other : ...

the redux_fields function returns ['bar', 'stuff', 'other'].
*/
export function redux_fields(spec) {
  const v: any[] = [];
  for (let _ in spec) {
    const val = spec[_];
    for (const key in val) {
      _ = val[key];
      v.push(key);
    }
  }
  return v;
}

// Export common React Hooks for convenience:
export * from "./hooks";
export * from "./redux-hooks";
