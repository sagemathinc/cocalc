/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Not sure where this should go...
declare global {
  interface Window {
    Primus: any;
  }
}

// Important: code below now assumes that a global variable called "DEBUG" is **defined**!
declare var DEBUG: boolean;
if (DEBUG == null) {
  var DEBUG = false;
}

let rclass: <P extends object>(
  Component: React.ComponentType<P>,
) => React.ComponentType<P>;

import React from "react";
import createReactClass from "create-react-class";
import { Provider, connect, useSelector } from "react-redux";
import json_stable from "json-stable-stringify";

import { Store } from "@cocalc/util/redux/Store";
import { Actions } from "@cocalc/util/redux/Actions";
import { AppRedux as AppReduxBase } from "@cocalc/util/redux/AppRedux";
import { Table, TableConstructor } from "./Table";

// Relative import is temporary, until I figure this out -- needed for *project*
import { bind_methods, keys, is_valid_uuid_string } from "@cocalc/util/misc";
export { TypedMap, createTypedMap } from "@cocalc/util/redux/TypedMap";
import type { ClassMap } from "@cocalc/util/redux/types";
import { redux_name, project_redux_name } from "@cocalc/util/redux/name";
export { redux_name, project_redux_name };
import { NAME_TYPE as ComputeImageStoreType } from "../custom-software/util";
import { NEWS } from "@cocalc/frontend/notifications/news/init";

import * as types from "./actions-and-stores";
import type { ProjectStore } from "../project_store";
import type { ProjectActions } from "../project_actions";
export type { ProjectStore, ProjectActions };

export class AppRedux extends AppReduxBase {
  private _tables: ClassMap<any, Table>;

  constructor() {
    super();
    bind_methods(this);
    this._tables = {};
  }

  getActions(name: "account"): types.AccountActions;
  getActions(name: "projects"): types.ProjectsActions;
  getActions(name: "billing"): types.BillingActions;
  getActions(name: "page"): types.PageActions;
  getActions(name: "users"): types.UsersActions;
  getActions(name: "admin-users"): types.AdminUsersActions;
  getActions(name: "admin-site-licenses"): types.SiteLicensesActions;
  getActions(name: "mentions"): types.MentionsActions;
  getActions(name: "messages"): types.MessagesActions;
  getActions(name: "file_use"): types.FileUseActions;
  getActions(name: typeof NEWS): types.NewsActions;
  getActions(name: { project_id: string }): ProjectActions;
  getActions<T, C extends Actions<T>>(name: string): C;
  getActions<T, C extends Actions<T>>(
    name: string | { project_id: string },
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

  getStore(name: "account"): types.AccountStore;
  getStore(name: "projects"): types.ProjectsStore;
  getStore(name: "billing"): types.BillingStore;
  getStore(name: "page"): types.PageStore;
  getStore(name: "admin-users"): types.AdminUsersStore;
  getStore(name: "admin-site-licenses"): types.SiteLicensesStore;
  getStore(name: "mentions"): types.MentionsStore;
  getStore(name: "messages"): types.MessagesStore;
  getStore(name: "file_use"): types.FileUseStore;
  getStore(name: "customize"): types.CustomizeStore;
  getStore(name: "users"): types.UsersStore;
  getStore(name: ComputeImageStoreType): types.ComputeImagesStore;
  getStore(name: typeof NEWS): types.NewsStore;
  getStore<State extends Record<string, any>>(name: string): Store<State>;
  getStore<State extends Record<string, any>, C extends Store<State>>(
    nam: string,
  ): C | undefined;
  getStore(name) {
    return super.getStore(name);
  }

  getProjectsStore(): types.ProjectsStore {
    return this.getStore("projects");
  }

  createTable<T extends Table>(
    name: string,
    table_class: TableConstructor<T>,
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

  getTable<T extends Table>(name: string): T {
    if (this._tables[name] == null) {
      throw Error(`getTable: table "${name}" not registered`);
    }
    return this._tables[name];
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
    project_id?: string,
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
  getProjectStore(project_id: string): ProjectStore {
    if (!is_valid_uuid_string(project_id)) {
      throw Error(`getProjectStore: INVALID project_id -- "${project_id}"`);
    }
    if (!this.hasProjectStore(project_id)) {
      // Right now importing project_store breaks the share server,
      // so we don't yet.
      return require("../project_store").init(project_id, this);
    } else {
      return this.getStore(project_redux_name(project_id)) as any;
    }
  }

  // TODO -- Typing: Type project Actions
  // T, C extends Actions<T>
  getProjectActions(project_id: string): ProjectActions {
    if (!is_valid_uuid_string(project_id)) {
      throw Error(`getProjectActions: INVALID project_id -- "${project_id}"`);
    }
    if (!this.hasProjectStore(project_id)) {
      require("../project_store").init(project_id, this);
    }
    return this.getActions(project_redux_name(project_id)) as any;
  }
  // TODO -- Typing: Type project Table
  getProjectTable(project_id: string, name: string): any {
    if (!is_valid_uuid_string(project_id)) {
      throw Error(`getProjectTable: INVALID project_id -- "${project_id}"`);
    }
    if (!this.hasProjectStore(project_id)) {
      require("../project_store").init(project_id, this);
    }
    return this.getTable(project_redux_name(project_id, name));
  }

  removeProjectReferences(project_id: string): void {
    if (!is_valid_uuid_string(project_id)) {
      throw Error(
        `getProjectReferences: INVALID project_id -- "${project_id}"`,
      );
    }
    const name = project_redux_name(project_id);
    const store = this.getStore(name);
    store?.destroy?.();
    this.removeActions(name);
    this.removeStore(name);
  }

  // getEditorActions but for whatever editor  -- this is mainly meant to be used
  // from the console when debugging, e.g., smc.redux.currentEditorActions()
  public currentEditor = (): {
    project_id?: string;
    path?: string;
    account_id?: string;
    actions?: Actions<any>;
    store?: Store<any>;
  } => {
    const project_id = this.getStore("page").get("active_top_tab");
    const current: {
      project_id?: string;
      path?: string;
      account_id?: string;
      actions?: Actions<any>;
      store?: Store<any>;
    } = { account_id: this.getStore("account")?.get("account_id") };
    if (!is_valid_uuid_string(project_id)) {
      return current;
    }
    current.project_id = project_id;
    const store = this.getProjectStore(project_id);
    const tab = store.get("active_project_tab");
    if (!tab.startsWith("editor-")) {
      return current;
    }
    const path = tab.slice("editor-".length);
    current.path = path;
    current.actions = this.getEditorActions(project_id, path);
    current.store = this.getEditorStore(project_id, path);
    return current;
  };
}

const computed = (rtype) => {
  const clone = rtype.bind({});
  clone.is_computed = true;
  return clone;
};

const rtypes = require("@cocalc/util/opts").types;

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
            JSON.stringify(spec),
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
              `-- e.g. rtypes.bool vs. rtypes.boolean`,
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
  return json_stable(keys(data).sort())!;
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
          this.props.children,
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
            "You may not define a method named actions in an rclass. This is used to expose redux actions",
          );
        }

        definition.actions = redux.getActions;

        if (this.cache[key] == null) {
          this.cache[key] = rclass(definition);
        } // wait.. is this even the slow part?

        return React.createElement(
          this.cache[key],
          this.props,
          this.props.children,
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
        "You may not define a method named actions in an rclass. This is used to expose redux actions",
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

/*
The non-tsx version of this:
  <Provider store={redux.reduxStore}>
     {children}
  </Provider>
*/
export function Redux({ children }) {
  return React.createElement(Provider, {
    store: redux.reduxStore,
    children,
  }) as any;
}

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
//import ReactDOM from "react-dom";
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
