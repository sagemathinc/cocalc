/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//#############################################################################
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
// SMC specific wrapper around the redux library
//##############################################################################

// Important: code below now assumes that a global variable called "DEBUG" is **defined**!
declare var DEBUG: boolean, Primus, smc;
if (DEBUG == null) {
  var DEBUG = false;
}

let rclass: (x?) => () => React.ReactElement<any>;

import { EventEmitter } from "events";
import * as async from "async";
import * as immutable from "immutable";
import * as underscore from "underscore";
import * as React from "react";
import { createStore as createReduxStore } from "redux";
import * as createReactClass from "create-react-class";
import * as PropTypes from "prop-types";
import { createSelector } from "reselect";
import { Provider, connect } from "react-redux";

const misc = require("smc-util/misc");
const { defaults, required } = misc;

// TODO: WTF is this doing here??
export let COLOR = {
  BG_RED: "#d9534f", // the red bootstrap color of the button background
  FG_RED: "#c9302c", // red used for text
  FG_BLUE: "#428bca" // blue used for text
};

class Table {
  public name: string;
  protected redux: any; // TODO: change to whatever the official redux store type is
  protected readonly _change: (table: any, keys: string[]) => void;
  private _table: any;

  // override in derived class to pass in options to the query -- these only impact initial query, not changefeed!
  options?: () => any[];
  query: () => void;

  constructor(name, redux) {
    this.set = this.set.bind(this);
    if (this.options) {
      this.options.bind(this);
    }
    this.name = name;
    this.redux = redux;
    if (typeof Primus === "undefined" || Primus === null) {
      // hack for now -- not running in browser (instead in testing server)
      return;
    }
    this._table = require("./webapp_client").webapp_client.sync_table(
      this.query(),
      this.options ? this.options() : []
    );
    if (this._change !== undefined) {
      this._table.on("change", keys => {
        return this._change(this._table, keys);
      });
    }
  }

  set(changes, merge, cb) {
    return this._table.set(changes, merge, cb);
  }
}

// NOTE: it is intentional that there is no get method.  Instead, get data
// from stores.  The table will set stores (via creating actions) as
// needed when it changes.

class Actions {
  public name: string;
  protected redux: any;

  constructor(name, redux) {
    this.setState = this.setState.bind(this);
    this.destroy = this.destroy.bind(this);
    this.name = name;
    this.redux = redux;
    if (this.name == null) {
      throw Error("@name must be defined");
    }
    if (this.redux == null) {
      throw Error("@redux must be defined");
    }
  }

  setState(obj, nothing_else) {
    if (nothing_else != null) {
      throw Error(
        "setState takes exactly one argument, which must be an object"
      );
    }
    if (DEBUG && this.redux.getStore(this.name).__converted) {
      for (let key in obj) {
        let descriptor = Object.getOwnPropertyDescriptor(
          this.redux.getStore(this.name),
          key
        );
        if (descriptor == undefined || !descriptor.get) {
          console.warn(
            `\`${key}\` is not declared in stateTypes of store name \`${
              this.name
            }\``
          );
        }
      }
    }
    this.redux._set_state({ [this.name]: obj });
  }

  destroy() {
    return this.redux.removeActions(this.name);
  }
}

export interface store_definition<T> {
  name: string;
  getInitialState?: () => T;
}

/*
store_def =
    reduxState:
        account:
            full_name : computed rtypes.string

    * Values not defined in stateTypes are not accessible as properties
    * They are also not available through reduxProps
    stateTypes:
        basic_input         : rtypes.string
        displayed_cc_number : rtypes.string
        some_list           : rtypes.immutable.List
        filtered_val        : computed rtypes.immutable.List

    displayed_cc_number: ->
        return @getIn(['project_map', 'users', 'cc'])

    filtered_val: depends('basic_input', 'some_list') ->
        return @some_list.filter (val) => val == @basic_input

Note: you cannot name a property "state" or "props"
*/
class Store extends EventEmitter {
  public name: string;
  protected redux: any;
  private _last_state: any;

  constructor(name, redux, store_def?) {
    super();
    this._handle_store_change = this._handle_store_change.bind(this);
    this.destroy = this.destroy.bind(this);
    this.getState = this.getState.bind(this);
    this.get = this.get.bind(this);
    this.getIn = this.getIn.bind(this);
    this.wait = this.wait.bind(this);
    this.name = name;
    this.redux = redux;
    this.setMaxListeners(150);
    if (store_def == null) {
      return;
    }
    const import_functions = harvest_import_functions(store_def);
    const own_functions = harvest_own_functions(store_def);
    Object.assign(this, store_def);

    // Bind all functions to this scope.
    // For example, they importantly get access to @redux, @get, and @getIn
    const [b_own_functions, b_import_functions] = misc.bind_objects(this, [
      own_functions,
      import_functions
    ]);
    const selectors = generate_selectors(b_own_functions, b_import_functions);

    // Bind selectors as properties on this store
    const prop_map = {};
    underscore.map(selectors, (selector, name) => {
      return (prop_map[name] = {
        get() {
          return selector(this.getState());
        },
        enumerable: true
      });
    });

    Object.defineProperties(this, prop_map);
  }

  _handle_store_change(state) {
    if (state !== this._last_state) {
      this._last_state = state;
      return this.emit("change", state);
    }
  }

  destroy() {
    return this.redux.removeStore(this.name);
  }

  getState() {
    return this.redux._redux_store.getState().get(this.name);
  }

  get(field) {
    return this.redux._redux_store.getState().getIn([this.name, field]);
  }

  getIn(...args) {
    return this.redux._redux_store
      .getState()
      .getIn([this.name].concat(args[0]));
  }

  // wait: for the store to change to a specific state, and when that
  // happens call the given callback.
  wait(opts) {
    let timeout;
    opts = defaults(opts, {
      until: required, // waits until "until(store)" evaluates to something truthy
      throttle_ms: undefined, // in ms -- throttles the call to until(store)
      timeout: 30, // in seconds -- set to 0 to disable (DANGEROUS since until will get run for a long time)
      cb: required
    }); // cb(undefined, until(store)) on success and cb('timeout') on failure due to timeout
    if (opts.throttle_ms != null) {
      opts.until = underscore.throttle(opts.until, opts.throttle_ms);
    }
    // Do a first check to see if until is already true
    let x = opts.until(this);
    if (x) {
      opts.cb(undefined, x);
      return;
    }
    // If we want a timeout (the default), setup a timeout
    if (opts.timeout) {
      const timeout_error = () => {
        this.removeListener("change", listener);
        return opts.cb("timeout");
      };
      timeout = setTimeout(timeout_error, opts.timeout * 1000);
    }
    // Setup a listener
    var listener = () => {
      x = opts.until(this);
      if (x) {
        if (timeout) {
          clearTimeout(timeout);
        }
        this.removeListener("change", listener);
        return async.nextTick(() => opts.cb(undefined, x));
      }
    };
    return this.on("change", listener);
  }
}

// Parses and removes store_def.reduxState
// Returns getters for data from other stores
var harvest_import_functions = function(store_def) {
  const result = {};
  for (var store_name in store_def.reduxState) {
    const values = store_def.reduxState[store_name];
    for (var prop_name in values) {
      result[prop_name] = function() {
        let val;
        const store = this.redux.getStore(store_name);
        if (store.__converted != null) {
          val = store[prop_name];
        } else {
          // TODOJ: remove when all stores are converted
          val = store.get(prop_name);
          if (val == null) {
            val =
              typeof store[prop_name] === "function"
                ? store[prop_name]()
                : undefined;
          }
        }
        return val;
      };
    }
  }
  delete store_def.reduxState;
  return result;
};

// Parses and removes store_def.stateTypes
// Also removes store_def[func] where func
// is a key in store_def.stateTypes
// Returns functions for selectors
var harvest_own_functions = function(store_def) {
  const functions = {};
  underscore.map(store_def.stateTypes, (type, prop_name) => {
    // No defined selector, but described in state
    if (!store_def[prop_name]) {
      if (type.is_computed) {
        throw `Computed value '${prop_name}' in store '${
          store_def.name
        }' was declared but no definition was found.`;
      }
      return (functions[prop_name] = function() {
        return this.get(prop_name);
      });
    } else {
      functions[prop_name] = store_def[prop_name];
      return delete store_def[prop_name];
    }
  });
  delete store_def.stateTypes;
  return functions;
};

// Generates selectors based on functions found in `own` and `import_functions`
// Replaces and returns functions in `own` with appropriate selectors.
var generate_selectors = function(own, import_functions) {
  const all_selectors = Object.assign(own, import_functions);
  const DAG = misc.create_dependency_graph(all_selectors);
  const ordered_funcs = misc.top_sort(DAG, { omit_sources: true });
  // import_functions contains only sources so all funcs will be in own
  for (let func_name of ordered_funcs) {
    const selector = createSelector(
      DAG[func_name].map(dep_name => all_selectors[dep_name]),
      own[func_name]
    );
    own[func_name] = selector;
    all_selectors[func_name] = selector;
  }
  return own;
};

const depends = (...dependency_names) => deriving_func => {
  deriving_func.dependency_names = dependency_names;
  return deriving_func;
};

const action_set_state = function(change) {
  return {
    type: "SET_STATE",
    change: immutable.fromJS(change) // guaranteed immutable.js all the way down
  };
};
// Deeply nested objects need to be converted with fromJS before being put in the store

const action_remove_store = function(name) {
  let action;
  return (action = {
    type: "REMOVE_STORE",
    name
  });
};

type redux_state = immutable.Map<string, immutable.Map<string, any>>;

const redux_app = function(state: redux_state, action): redux_state {
  if (state == null) {
    return immutable.Map();
  }
  switch (action.type) {
    case "SET_STATE":
            // Typically action.change has exactly one key, the name of a Store.
            // We merge in what is in action.change[name] to state[name] below.
            action.change.map(function(val, store) {
                let left;
                const new_val = (left = __guard__(state.get(store), x => x.merge(val))) != null ? left : val;
                return state = state.set(store, new_val);
            });
            return state;
    case "REMOVE_STORE":
      return state.delete(action.name);
    default:
      return state;
  }
};

class AppRedux {
  private _tables: any;
  private _stores: any;
  private _redux_store: any;
  private _actions: any;
  private _last_state: redux_state;

  constructor() {
    this._redux_store_change = this._redux_store_change.bind(this);
    this.show_state = this.show_state.bind(this);
    this.log_states = this.log_states.bind(this);
    this._set_state = this._set_state.bind(this);
    this.createActions = this.createActions.bind(this);
    this.getActions = this.getActions.bind(this);
    this.createStore = this.createStore.bind(this);
    this.getStore = this.getStore.bind(this);
    this.createTable = this.createTable.bind(this);
    this.removeTable = this.removeTable.bind(this);
    this.removeStore = this.removeStore.bind(this);
    this.removeActions = this.removeActions.bind(this);
    this.getTable = this.getTable.bind(this);
    this.getProjectStore = this.getProjectStore.bind(this);
    this.getProjectActions = this.getProjectActions.bind(this);
    this.getProjectTable = this.getProjectTable.bind(this);
    this.removeProjectReferences = this.removeProjectReferences.bind(this);
    this.getEditorStore = this.getEditorStore.bind(this);
    this.getEditorActions = this.getEditorActions.bind(this);
    this._tables = {};
    this._redux_store = createReduxStore(redux_app);
    this._stores = {};
    this._actions = {};
    this._redux_store.subscribe(this._redux_store_change);
  }

  // Only used by tests to completely reset the global redux instance
  __reset(): void {
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
    for (let name in this._stores) {
      const store = this._stores[name];
      const s = state.get(name);
      if (this._last_state.get(name) !== s) {
        store._handle_store_change(s);
      }
    }
  }

  show_state(): void {
    console.log(JSON.stringify(this._redux_store.getState().toJS()));
  }

  // Returns a function which cancels logging state
  log_states(): () => void {
    return this._redux_store.subscribe(this.show_state);
  }

  _set_state(change): void {
    this._redux_store.dispatch(action_set_state(change));
  }

  createActions(name: string, actions_class = Actions): Actions {
    if (name == null) {
      throw Error("name must be a string");
    }

    if (this._actions[name] === undefined) {
      this._actions[name] = new actions_class(name, this);
    }

    return this._actions[name];
  }

  getActions(name: string | { project_id: string }): Actions {
    if (name == null) {
      throw Error(
        "name must be a string or an object with a project_id attribute, but is undefined"
      );
    }
    if (typeof name === "string") {
      return this._actions[name];
    } else {
      if (name.project_id == null) {
        throw Error("Object must have project_id attribute");
      }
      return this.getProjectActions(name.project_id);
    }
  }

  createStore(spec: store_definition<{}>);
  createStore(name: string, init?: {});
  createStore(name: string, store_class, init?: {}): Store;
  createStore(spec: string | store_definition<{}>, store_class?, init?) {
    let S;
    if (typeof spec === "string") {
      let name = spec;
      if (init === undefined && typeof store_class !== "function") {
        init = store_class;
        store_class = Store;
      }
      S = this._stores[name];
      if (S == undefined) {
        S = this._stores[name] = new store_class(name, this);
        // Put into store. WARNING: New set_states CAN OVERWRITE THESE FUNCTIONS
        let C = immutable.Map(S);
        C = C.delete("redux"); // No circular pointing
        this._set_state({ [name]: C });
        if (init != null) {
          this._set_state({ [name]: init });
        }
      }
    } else {
      if (spec.name == undefined) {
        throw Error("name must be a string");
      }

      init =
        typeof spec.getInitialState === "function"
          ? spec.getInitialState()
          : undefined;
      delete spec.getInitialState;

      S = this._stores[spec.name];
      if (S == null) {
        S = this._stores[spec.name] = new Store(spec.name, this, spec);
        // TODOJ: REMOVE
        S.__converted = true;
      }
      if (init != null) {
        this._set_state({ [spec.name]: init });
      }
      if (typeof S._init === "function") {
        S._init();
      }
    }
    return S;
  }

  getStore(name) {
    if (name == null) {
      throw Error("name must be a string");
    }
    return this._stores[name];
  }

  createTable(name, table_class = Table) {
    if (name == null) {
      throw Error("name must be a string");
    }
    const tables = this._tables;
    if (tables[name] != null) {
      throw Error(`createTable: table ${name} already exists`);
    }
    if (table_class == null) {
      throw Error(
        "createTable: second argument must be a class that extends Table"
      );
    }
    const table = new table_class(name, this);
    // TODO: Only necessary since not everything is typed yet
    if ((!table as any) instanceof Table) {
      throw Error("createTable: takes a name and Table class (not object)");
    }
    return (tables[name] = table);
  }

  removeTable(name) {
    if (name == null) {
      throw Error("name must be a string");
    }
    if (this._tables[name] != null) {
      if (this._tables[name]._table != null) {
        this._tables[name]._table.close();
      }
      return delete this._tables[name];
    }
  }

  removeStore(name) {
    if (name == null) {
      throw Error("name must be a string");
    }
    if (this._stores[name] != null) {
      const S = this._stores[name];
      S.emit("destroy");
      delete this._stores[name];
      S.removeAllListeners();
      return this._redux_store.dispatch(action_remove_store(name));
    }
  }

  removeActions(name) {
    if (name == null) {
      throw Error("name must be a string");
    }
    if (this._actions[name] != null) {
      const A = this._actions[name];
      delete this._actions[name];
      return A.destroy();
    }
  }

  getTable(name) {
    if (name == null) {
      throw Error("name must be a string");
    }
    if (this._tables[name] == null) {
      throw Error(`getTable: table ${name} not registered`);
    }
    return this._tables[name];
  }

  project_redux_name(project_id: string, name?: string): string {
    let s = `project-${project_id}`;
    if (name !== undefined) s += `-${name}`;
    return s;
  }

  getProjectStore(project_id) {
    if (!misc.is_valid_uuid_string(project_id)) {
      console.trace();
      console.warn(`getProjectStore: INVALID project_id -- ${project_id}`);
    }

    return this.getStore(this.project_redux_name(project_id));
  }

  getProjectActions(project_id) {
    if (!misc.is_valid_uuid_string(project_id)) {
      console.trace();
      console.warn(`getProjectActions: INVALID project_id -- ${project_id}`);
    }
    return this.getActions(this.project_redux_name(project_id));
  }

  getProjectTable(project_id, name) {
    if (!misc.is_valid_uuid_string(project_id)) {
      console.trace();
      console.warn(`getProjectTable: INVALID project_id -- ${project_id}`);
    }
    return this.getTable(this.project_redux_name(project_id, name));
  }

  removeProjectReferences(project_id): void {
    if (!misc.is_valid_uuid_string(project_id)) {
      console.trace();
      console.warn(`getProjectReferences: INVALID project_id -- ${project_id}`);
    }
    const name = this.project_redux_name(project_id);
    let store = this.getStore(name);
    if (typeof store.destroy == "function") {
      store.destroy();
    }
    this.removeActions(name);
    this.removeStore(name);
  }

  getEditorStore(project_id, path, is_public) {
    if (!misc.is_valid_uuid_string(project_id)) {
      console.trace();
      console.warn(`getEditorStore: INVALID project_id -- ${project_id}`);
    }
    return this.getStore(exports.redux_name(project_id, path, is_public));
  }

  getEditorActions(project_id, path, is_public) {
    if (!misc.is_valid_uuid_string(project_id)) {
      console.trace();
      console.warn(`getEditorActions: INVALID project_id -- ${project_id}`);
    }
    return this.getActions(exports.redux_name(project_id, path, is_public));
  }
}

const redux = new AppRedux();

const computed = rtype => {
  const clone = rtype.bind({});
  clone.is_computed = true;
  return clone;
};

// For backward compatibility
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
const connect_component = spec => {
  const map_state_to_props = function(state) {
    const props = {};
    if (state == null) {
      return props;
    }
    for (let store_name in spec) {
      const info = spec[store_name];
      if (store_name === "undefined") {
        // gets turned into this string when making a common mistake
        console.warn("spec = ", spec);
        throw Error("store_name of spec *must* be defined");
      }
      const store = redux.getStore(store_name);
      for (let prop in info) {
        var val;
        const type = info[prop];
        if ((store != null ? store.__converted : undefined) != null) {
          val = store[prop];
          if (
            __guard__(
              Object.getOwnPropertyDescriptor(store, prop),
              x => x.get
            ) == null
          ) {
            if (DEBUG) {
              console.warn(
                `Requested reduxProp \`${prop}\` from store \`${store_name}\` but it is not defined in its stateTypes nor reduxProps`
              );
            }
            val = state.getIn([store_name, prop]);
          }
        } else {
          // TODOJ: remove *if* all stores are ever converted  (which may or may not be desirable/needed)
          val = state.getIn([store_name, prop]);
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

const react_component = function(x) {
  let C;
  if (typeof x === "function" && typeof x.reduxProps === "function") {
    // using an ES6 class *and* reduxProps...
    C = createReactClass({
      render() {
        if (this.cache0 == null) {
          this.cache0 = {};
        }
        const reduxProps = x.reduxProps(this.props);
        const key = misc
          .keys(reduxProps)
          .sort()
          .join("");
        if (this.cache0[key] == null) {
          this.cache0[key] = connect_component(reduxProps)(x);
        }
        return React.createElement(
          this.cache0[key],
          this.props,
          this.props.children
        );
      }
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
        const key = misc
          .keys(definition.reduxProps)
          .sort()
          .join("");

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
      }
    });

    return cached;
  } else {
    if (x.reduxProps != null) {
      // Inject the propTypes based on the ones injected by reduxProps.
      const propTypes = x.propTypes != null ? x.propTypes : {};
      for (let store_name in x.reduxProps) {
        const info = x.reduxProps[store_name];
        for (let prop in info) {
          const type = info[prop];
          if (type !== rtypes.immutable) {
            propTypes[prop] = type;
          } else {
            propTypes[prop] = rtypes.object;
          }
        }
      }
      x.propTypes = propTypes;
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
      // as this component is in a heierarchy wrapped by <Redux redux={redux}>...</Redux>
      C = connect_component(x.reduxProps)(C);
    }
  }
  return C;
};

let MODE = "default"; // one of 'default', 'count', 'verbose', 'time'
//MODE = 'verbose'  # print every CoCalc component that is rendered when rendered
//MODE = 'trace'     # print only components that take some time, along with timing info
//MODE = 'count'    # collect count of number of times each component is rendered; call get_render_count and reset_render_count to see.
//MODE = 'time'      # show every single component render and how long it took

if (typeof smc === "undefined" || smc === null) {
  MODE = "default"; // never enable in prod
}

if (MODE !== "default") {
  console.log(`smc-react MODE='${MODE}'`);
}

switch (MODE) {
  case "count":
    // Use these in the console:
    //  reset_render_count()
    //  JSON.stringify(get_render_count())
    var render_count = {};
    rclass = function(x) {
      x._render = x.render;
      x.render = function() {
        render_count[x.displayName] =
          (render_count[x.displayName] != null
            ? render_count[x.displayName]
            : 0) + 1;
        return this._render();
      };
      return react_component(x);
    };
    (window as any).get_render_count = function() {
      let total = 0;
      for (let k in render_count) {
        const v = render_count[k];
        total += v;
      }
      return { counts: render_count, total };
    };
    (window as any).reset_render_count = function() {
      render_count = {};
    };
    break;
  case "time":
    rclass = x => {
      const t0 = performance.now();
      const r = react_component(x);
      const t1 = performance.now();
      if (t1 - t0 > 1) {
        console.log(r.displayName, "took", t1 - t0, "ms of time");
      }
      return r;
    };
    break;
  case "verbose":
    rclass = function(x) {
      x._render = x.render;
      x.render = function() {
        console.log(x.displayName);
        return this._render();
      };
      return react_component(x);
    };
    break;
  case "trace":
    var { react_debug_trace } = require("./smc-react-debug");
    rclass = react_debug_trace(react_component);
    break;
  case "default":
    rclass = react_component;
    break;
  default:
    throw Error(`UNKNOWN smc-react MODE='${MODE}'`);
}

const Redux = createReactClass({
  propTypes: {
    redux: PropTypes.object.isRequired
  },
  render() {
    return React.createElement(
      Provider,
      { store: this.props.redux._redux_store },
      this.props.children
    );
  }
});
// The lines above are just the non-cjsx version of this:
//<Provider store={@props.redux._redux_store}>
//    {@props.children}
//</Provider>

// Public interface
export function is_redux(obj) {
  return obj instanceof AppRedux;
}
export function is_redux_actions(obj) {
  return obj instanceof Actions;
}

// Canonical name to use for Redux store associated to a given project/path.
// TODO: this code is also in many editors -- make them all just use this.
export function redux_name(project_id, path, is_public) {
  if (is_public) {
    return `public-${project_id}-${path}`;
  } else {
    return `editor-${project_id}-${path}`;
  }
}

export { rclass }; // use rclass instead of createReactClass to get access to reduxProps support
export { rtypes }; // has extra rtypes.immutable, needed for reduxProps to leave value as immutable
export { computed };
export { depends };
export { React };
export let { Fragment } = React;
export { Redux };
export { redux }; // global redux singleton
export { Actions };
export { Table };
export { Store };
export let ReactDOM = require("react-dom");

if (DEBUG) {
  if (typeof smc !== "undefined" && smc !== null) {
    smc.redux = redux;
  } // for convenience in the browser (mainly for debugging)
}

const __internals = {
  AppRedux,
  harvest_import_functions,
  harvest_own_functions,
  generate_selectors,
  connect_component,
  react_component
};

if (
  __guard__(
    typeof process !== "undefined" && process !== null
      ? process.env
      : undefined,
    x => x.SMC_TEST
  )
) {
  exports.__internals = __internals;
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
    for (let key in val) {
      _ = val[key];
      v.push(key);
    }
  }
  return v;
}
function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
