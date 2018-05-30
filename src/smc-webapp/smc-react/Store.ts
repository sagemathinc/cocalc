import { EventEmitter } from "events";
import * as async from "async";
import * as underscore from "underscore";
import { createSelector } from "reselect";
import { AppRedux } from "../smc-react-ts";

const misc = require("smc-util/misc");
const { defaults, required } = misc;

export interface store_base_state {
  readonly name: string;
}

export type StoreConstructorType<T, C = Store<T>> = new (
  name: string,
  redux: AppRedux,
  store_def?: T
) => C;

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
export class Store<State> extends EventEmitter {
  public name: string;
  public __converted?: boolean;
  public getInitialState?: () => State;
  protected redux: AppRedux;
  private _last_state: State;

  constructor(name: string, redux: AppRedux, store_def?: State) {
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
      prop_map[name] = {
        get() {
          return selector(this.getState());
        },
        enumerable: true
      };
    });

    Object.defineProperties(this, prop_map);
  }

  _handle_store_change(state: State): void {
    if (state !== this._last_state) {
      this._last_state = state;
      this.emit("change", state);
    }
  }

  destroy(): void {
    this.redux.removeStore(this.name);
  }

  getState(): State {
    return this.redux._redux_store.getState().get(this.name);
  }

  get<K extends keyof State, NSV = State[K]>(field: K, notSetValue?: NSV): State[K] | NSV {
    return this.redux._redux_store
      .getState()
      .getIn([this.name, field, notSetValue]);
  }

  // Only works 3 levels deep.
  // It's probably advisable to normalize your data if you find yourself that deep
  // https://redux.js.org/recipes/structuring-reducers/normalizing-state-shape
  // If you need to describe a recurse data structure such as a binary tree, use unsafe_getIn.
  getIn<K1 extends keyof State, NSV = State[K1]>(
    path: [K1],
    notSetValue?: NSV
  ): State[K1] | NSV;
  getIn<K1 extends keyof State, K2 extends keyof State[K1], NSV = State[K1][K2]>(
    path: [K1, K2],
    notSetValue?: NSV
  ): State[K1][K2] | NSV;
  getIn<
    K1 extends keyof State,
    K2 extends keyof State[K1],
    K3 extends keyof State[K1][K2],
    NSV = State[K1][K2][K3]
  >(path: [K1, K2, K3], notSetValue?: NSV): State[K1][K2][K3] | NSV;
  getIn(path: any[], notSetValue?: any): any {
    return this.redux._redux_store
      .getState()
      .getIn([this.name].concat(path), notSetValue);
  }

  unsafe_getIn(path: any[], notSetValue?: any): any {
    return this.redux._redux_store
      .getState()
      .getIn([this.name].concat(path), notSetValue);
  }

  // wait: for the store to change to a specific state, and when that
  // happens call the given callback.
  wait<T>(opts: {
    until: (store: Store<State>) => T;
    cb: (err?: string, result?: T) => any;
    throttle_ms?: number;
    timeout?: number;
  }): this | undefined {
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
        opts.cb("timeout");
        return;
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
      functions[prop_name] = function() {
        return this.get(prop_name);
      };
    } else {
      functions[prop_name] = store_def[prop_name];
      delete store_def[prop_name];
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

let test: StoreConstructorType<
  store_base_state,
  Store<store_base_state>
> = Store;

test.toString();
