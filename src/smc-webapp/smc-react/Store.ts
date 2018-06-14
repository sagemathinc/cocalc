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
  public getInitialState?: () => State;
  protected redux: AppRedux;
  private _last_state: State;

  constructor(name: string, redux: AppRedux) {
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

  get<K extends keyof State, NSV = State[K]>(
    field: K,
    notSetValue?: NSV
  ): State[K] | NSV {
    if (this.selectors && this.selectors[field] != undefined) {
      return this.selectors[field].fn();
    } else {
      return this.redux._redux_store
        .getState()
        .getIn([this.name, field, notSetValue]);
    }
  }

  // Only works 3 levels deep.
  // It's probably advisable to normalize your data if you find yourself that deep
  // https://redux.js.org/recipes/structuring-reducers/normalizing-state-shape
  // If you need to describe a recurse data structure such as a binary tree, use unsafe_getIn.
  getIn<K1 extends keyof State, NSV>(
    path: [K1],
    notSetValue?: NSV
  ): State[K1] | NSV;
  getIn<K1 extends keyof State, K2 extends keyof State[K1], NSV>(
    path: [K1, K2],
    notSetValue?: NSV
  ): State[K1][K2] | NSV;
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
