import { EventEmitter } from "events";

import { throttle } from "lodash";
import * as async from "async";
import { fromJS } from "immutable";

import { createSelector } from "reselect";
import { AppRedux } from "../app-framework";
import { TypedMap } from "./TypedMap";
import { TypedCollectionMethods } from "./immutable-types";
import { callback2 } from "../../smc-util/async-utils";
import { defaults, required, top_sort } from "../../smc-util/misc";
// Relative import is temporary, until I figure this out -- needed for *project*
// import { fill } from "../../smc-util/fill";
// fill does not even compile for the backend project (using the fill from the fill
// module breaks starting projects).
// NOTE: a basic requirement of "redux app framework" is that it can fully run
// on the backend (e.g., in a project) under node.js.

export type StoreConstructorType<T, C = Store<T>> = new (
  name: string,
  redux: AppRedux,
  store_def?: T
) => C;

export interface Selector<State, K extends keyof State> {
  dependencies?: readonly (keyof State)[];
  fn: () => State[K];
}

/**
 *
 */
export class Store<State> extends EventEmitter {
  public name: string;
  public getInitialState?: () => State;
  protected redux: AppRedux;
  protected selectors?: {
    [K in keyof Partial<State>]: Selector<State, K> | undefined;
  };
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
  }

  protected setup_selectors(): void {
    if (this.selectors) {
      type selector = Selector<State, any>;
      const created_selectors: { [K in keyof State]: selector } = {} as any;
      const dependency_graph: any = {}; // Used to check for cycles

      for (const selector_name of Object.getOwnPropertyNames(this.selectors)) {
        // List of dependent selectors for this prop_name
        const dependent_selectors: selector[] = [];

        // Names of dependencies
        const dependencies = this.selectors[selector_name].dependencies || [];
        dependency_graph[selector_name] = dependencies;

        for (const dep_name of dependencies) {
          if (created_selectors[dep_name] == undefined) {
            created_selectors[dep_name] = (): any => {
              return this.get(dep_name);
            };
          }
          dependent_selectors.push(created_selectors[dep_name]);

          // Set the selector function to the new selector
          this.selectors[selector_name].fn = createSelector(
            dependent_selectors as any,
            this.selectors[selector_name].fn
          ) as any;
        }
      }
      // check if there are cycles
      try {
        top_sort(dependency_graph);
      } catch {
        throw new Error(
          `redux store "${this.name}" has cycle in its selector dependencies`
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
  };

  getState(): TypedMap<State> {
    return this.redux._redux_store.getState().get(this.name);
  }

  get: TypedCollectionMethods<State>["get"] = (
    field: string,
    notSetValue?: any
  ): any => {
    if (this.selectors && this.selectors[field] != undefined) {
      return this.selectors[field].fn(this.getState());
    } else {
      return this.redux._redux_store
        .getState()
        .getIn([this.name, field], notSetValue);
    }
  };

  getIn: TypedCollectionMethods<State>["getIn"] = (
    path: any[],
    notSetValue?: any
  ): any => {
    if (path.length == 0) {
      return undefined;
    }
    // Assumes no nested stores
    const first_key = path[0];
    if (this.selectors && this.selectors[first_key] != undefined) {
      let top_value = this.selectors[first_key].fn(this.getState());
      if (path.length == 1) {
        return top_value;
      } else if (typeof top_value.getIn === "function") {
        return top_value.getIn(path.slice(1), notSetValue);
      } else {
        console.warn(
          "Calling getIn on",
          this.name,
          "but",
          path[0],
          "is not immutable"
        );
        return fromJS(top_value).getIn(path.slice(1), notSetValue);
      }
    } else {
      return this.redux._redux_store
        .getState()
        .getIn([this.name].concat(path), notSetValue);
    }
  };

  unsafe_getIn(path: any[], notSetValue?: any): any {
    return this.redux._redux_store
      .getState()
      .getIn([this.name].concat(path), notSetValue);
  }

  /**
   * wait for the store to change to a specific state, and when that
   * happens call the given callback.
   */
  wait<T>(opts: {
    until: (store: any) => T; // waits until "until(store)" evaluates to something truthy
    cb: (err?: string, result?: T) => any; // cb(undefined, until(store)) on success and cb('timeout') on failure due to timeout
    throttle_ms?: number; // in ms -- throttles the call to until(store)
    timeout?: number; // in seconds -- set to 0 to disable (DANGEROUS since until will get run for a long time)
  }): this | undefined {
    let timeout_ref;
    /*
    let { until, cb, throttle_ms, timeout } = fill(opts, {
      timeout: 30
    });
    */
    opts = defaults(opts, {
      until: required,
      throttle_ms: undefined,
      timeout: 30,
      cb: required,
    });
    let { until } = opts;
    const { cb, throttle_ms, timeout } = opts;
    if (throttle_ms != undefined) {
      until = throttle(until, throttle_ms);
    }
    // Do a first check to see if until is already true
    let x = until(this);
    if (x) {
      cb(undefined, x);
      return;
    }
    // Setup a listener
    const listener = (): unknown => {
      x = until(this);
      if (x) {
        if (timeout_ref) {
          clearTimeout(timeout_ref);
        }
        this.removeListener("change", listener);
        return async.nextTick(() => cb(undefined, x));
      }
    };
    // If we want a timeout (the default), setup a timeout
    if (timeout) {
      const timeout_error = (): void => {
        this.removeListener("change", listener);
        cb("timeout");
        return;
      };
      timeout_ref = setTimeout(timeout_error, timeout * 1000);
    }
    return this.on("change", listener);
  }

  public async async_wait<T>(opts: {
    until: (store: any) => T; // waits until "until(store)" evaluates to something truthy
    throttle_ms?: number; // in ms -- throttles the call to until(store)
    timeout?: number; // in seconds -- set to 0 to disable (DANGEROUS since until will get run for a long time)
  }): Promise<any> {
    return await callback2(this.wait.bind(this), opts);
  }
}
