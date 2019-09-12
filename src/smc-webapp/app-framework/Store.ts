import { EventEmitter } from "events";
import * as async from "async";
import * as underscore from "underscore";
import { createSelector, Selector } from "reselect";
import { AppRedux } from "../app-framework";
import { TypedMap } from "./TypedMap";

const misc = require("smc-util/misc");
const { defaults, required } = misc;

export type StoreConstructorType<T, C = Store<T>> = new (
  name: string,
  redux: AppRedux,
  store_def?: T
) => C;

export interface selector<State, K extends keyof State> {
  dependencies?: (keyof State)[];
  fn: () => State[K];
}

export class Store<State> extends EventEmitter {
  public name: string;
  public getInitialState?: () => State;
  protected redux: AppRedux;
  protected selectors: { [K in keyof Partial<State>]: selector<State, K> };
  private _last_state: State;

  constructor(name: string, redux: AppRedux) {
    super();
    this._handle_store_change = this._handle_store_change.bind(this);
    this.getState = this.getState.bind(this);
    this.get = this.get.bind(this);
    this.getIn = this.getIn.bind(this);
    this.wait = this.wait.bind(this);
    this.name = name;
    this.redux = redux;
    this.setMaxListeners(150);
    if (this.selectors) {
      type selector = Selector<State, any>;
      let created_selectors: { [K in keyof State]: selector } = {} as any;

      let dependency_graph: any = {}; // Used to check for cycles

      for (let selector_name of Object.getOwnPropertyNames(this.selectors)) {
        // List of dependent selectors for this prop_name
        let dependent_selectors: selector[] = [];

        // Names of dependencies
        let dependencies = this.selectors[selector_name].dependencies;
        dependency_graph[selector_name] = dependencies || [];

        if (dependencies) {
          for (let dep_name of dependencies) {
            if (created_selectors[dep_name] == undefined) {
              created_selectors[dep_name] = () => this.get(dep_name);
            }
            dependent_selectors.push(created_selectors[dep_name]);

            // Set the selector function to the new selector
            this.selectors[dep_name].fn = createSelector(
              dependent_selectors as any,
              this.selectors[dep_name].fn
            ) as any;
          }
        }
      }
      // check if there are cycles
      try {
        misc.top_sort(dependency_graph);
      } catch {
        throw new Error(
          `redux store "${name}" has cycle in its selector dependencies`
        );
      }
      return;
    }
  }

  _handle_store_change(state: State): void {
    if (state !== this._last_state) {
      this._last_state = state;
      this.emit("change", state);
    }
  }

  destroy = (): void => {
    this.redux.removeStore(this.name);
  }

  getState(): TypedMap<State> {
    return this.redux._redux_store.getState().get(this.name);
  }

  get<K extends keyof State, NSV = State[K]>(
    field: K,
    notSetValue?: NSV
  ): State[K] | NSV {
    if (this.selectors && this.selectors[field] != undefined) {
      return this.selectors[field].fn();
    } else {
      return this.redux._redux_store
        .getState()
        .getIn([this.name, field], notSetValue);
    }
  }

  // Only works 3 levels deep.
  // It's probably advisable to normalize your data if you find yourself that deep
  // https://redux.js.org/recipes/structuring-reducers/normalizing-state-shape
  // If you need to describe a recurse data structure such as a binary tree, use unsafe_getIn.
  // Does not work with selectors.
  getIn<K1 extends keyof State>(
    path: [K1]
  ): State[K1];
  getIn<K1 extends keyof State, NSV>(
    path: [K1],
    notSetValue?: NSV
  ): State[K1] | NSV;
  getIn<K1 extends keyof State, K2 extends keyof State[K1]>(
    path: [K1, K2]
  ): State[K1][K2];
  getIn<K1 extends keyof State, K2 extends keyof State[K1], NSV>(
    path: [K1, K2],
    notSetValue?: NSV
  ): State[K1][K2] | NSV;
  getIn<
    K1 extends keyof State,
    K2 extends keyof State[K1],
    K3 extends keyof State[K1][K2]
  >(path: [K1, K2, K3]): State[K1][K2][K3];
  getIn<
    K1 extends keyof State,
    K2 extends keyof State[K1],
    K3 extends keyof State[K1][K2],
    NSV
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
