import { EventEmitter } from "events";
import * as async from "async";
import { createSelector } from "reselect";
import { AppRedux } from "../app-framework";
import { TypedMap } from "./TypedMap";
import { TypedCollectionMethods } from "./immutable-types";
import * as immutable from "immutable";
import * as misc from "../../smc-util/misc";
// Relative import is temporary, until I figure this out -- needed for *project*
// import { fill } from "../../smc-util/fill";
// fill does not even compile for the backend project (using the fill from the fill
// module breaks starting projects).
// NOTE: a basic requirement of "redux app framework" is that it can fully run
// on the backend (e.g., in a project) under node.js.
const { defaults, required } = misc;

import { throttle } from "lodash";

export type StoreConstructorType<T, C = Store<T>> = new (
  name: string,
  redux: AppRedux,
  store_def?: T
) => C;

export interface Selector<State, K extends keyof State> {
  dependencies?: (keyof State)[];
  fn: () => State[K];
}

/**
 *
 */
export class Store<State> extends EventEmitter {
  public name: string;
  public getInitialState?: () => State;
  protected redux: AppRedux;
  protected selectors: { [K in keyof Partial<State>]: Selector<State, K> };
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
      const created_selectors: { [K in keyof State]: selector } = {} as any;

      const dependency_graph: any = {}; // Used to check for cycles

      for (const selector_name of Object.getOwnPropertyNames(this.selectors)) {
        // List of dependent selectors for this prop_name
        const dependent_selectors: selector[] = [];

        // Names of dependencies
        const dependencies = this.selectors[selector_name].dependencies;
        dependency_graph[selector_name] = dependencies || [];

        if (dependencies) {
          for (const dep_name of dependencies) {
            if (created_selectors[dep_name] == undefined) {
              created_selectors[dep_name] = (): any => this.get(dep_name);
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
  };

  getState(): TypedMap<State> {
    return this.redux._redux_store.getState().get(this.name);
  }

  get: TypedCollectionMethods<State>["get"] = (
    field: string,
    notSetValue?: any
  ): any => {
    if (this.selectors && this.selectors[field] != undefined) {
      return this.selectors[field].fn();
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
    return immutable.getIn(this.get(path[0]), path.slice(1), notSetValue);
  };

  /**
  * Same as `getIn` but provides no type safety.
  *
  * Use as an escape hatch if you want to traverse more than 5 levels deep.
  * However you may want to consider normalizing your state.
  * https://redux.js.org/recipes/structuring-reducers/normalizing-state-shape/
  */
  unsafe_getIn(path: any[], notSetValue?: any): any {
    return (this.getIn as any)(path, notSetValue) as any;
  }

  /**
   * wait for the store to change to a specific state, and when that
   * happens call the given callback.
   */
  wait<T>(opts: {
    until: (store: Store<State>) => T; // waits until "until(store)" evaluates to something truthy
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
      cb: required
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
}
