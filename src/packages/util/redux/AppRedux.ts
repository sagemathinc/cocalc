import type { AppRedux as AppReduxInterface } from "./types";
import { Store, StoreConstructorType } from "./Store";
import { Actions } from "./Actions";
import type { ClassMap } from "./types";
import { bind_methods } from "@cocalc/util/misc";
import { fromJS, Map } from "immutable";
import { createStore as createReduxStore } from "redux";

type ReduxState = Map<string, Map<string, any>>;

function reduxApp(state: ReduxState, action): ReduxState {
  if (state == null) {
    return Map();
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
}

function actionSetState(change) {
  // Deeply nested objects need to be converted with fromJS before being put in the store
  return {
    type: "SET_STATE",
    change: fromJS(change), // guaranteed immutablejs all the way down
  };
}

function actionRemoveStore(name) {
  return {
    type: "REMOVE_STORE",
    name,
  };
}

export abstract class AppRedux implements AppReduxInterface {
  public reduxStore = createReduxStore(reduxApp);
  private lastReduxState: ReduxState;
  private changedStores: Set<string> = new Set([]);
  protected _stores: ClassMap<any, Store<any>> = {};
  protected _actions: ClassMap<any, Actions<any>> = {};

  constructor() {
    bind_methods(this);
    this.reduxStore.subscribe(this.reduxStoreChange.bind(this));
  }

  show_state(): void {
    console.log(JSON.stringify(this.reduxStore.getState().toJS()));
  }

  // Returns a function which cancels logging state
  log_states(): void {
    this.reduxStore.subscribe(this.show_state);
  }

  _set_state(change, store_name: string): void {
    this.changedStores.add(store_name);
    this.reduxStore.dispatch(actionSetState(change));
  }

  private reduxStoreChange(): void {
    const state = this.reduxStore.getState();
    if (this.lastReduxState == null) {
      this.lastReduxState = Map();
    }
    for (const name of this.changedStores) {
      const store = this._stores[name];
      if (store == null) continue;
      const s = state.get(name);
      if (this.lastReduxState.get(name) !== s) {
        store._handle_store_change(s);
      }
    }
    this.changedStores.clear();
  }

  // STORES

  createStore<
    State extends Record<string, any>,
    C extends Store<State> = Store<State>
  >(
    name: string,
    store_class?: StoreConstructorType<State, C>,
    init?: {} | State
  ): C {
    let S: any = this._stores[name];
    if (S != null) throw Error(`store ${name} already exists`);
    if (init === undefined && typeof store_class !== "function") {
      // so can do createStore(name, {default init})
      init = store_class;
      store_class = undefined;
    }
    if (S == null) {
      if (store_class == null) {
        S = this._stores[name] = new Store(name, this);
      } else {
        S = this._stores[name] = new store_class(name, this);
      }
      // Put into store. WARNING: New set_states CAN OVERWRITE THESE FUNCTIONS
      let X = Map(S as {});
      X = X.delete("redux"); // No circular pointing
      this._set_state({ [name]: X }, name);
    }
    if (typeof S.getInitialState === "function") {
      init = S.getInitialState();
    }
    if (init != null) {
      this._set_state({ [name]: init }, name);
    }
    return S as C;
  }

  hasStore(name: string): boolean {
    return !!this._stores[name];
  }

  getStore(name) {
    if (!this.hasStore(name)) {
      return undefined;
    }
    return this._stores[name];
  }

  removeStore(name: string): void {
    if (this._stores[name] != null) {
      const S = this._stores[name];
      S.emit("destroy");
      delete this._stores[name];
      S.removeAllListeners();
      this.reduxStore.dispatch(actionRemoveStore(name));
    }
  }

  // ACTIONS
  createActions<T, C extends Actions<T>>(
    name: string,
    ActionsClass?: new (a, b) => C
  ): C {
    if (name == null) {
      throw Error("name must be a string");
    }

    if (this._actions[name] == null) {
      if (ActionsClass == null) {
        this._actions[name] = new Actions(name, this);
      } else {
        this._actions[name] = new ActionsClass(name, this);
      }
    }

    return this._actions[name];
  }

  hasActions(name: string): boolean {
    return !!this._actions[name];
  }

  getActions(name: string) {
    if (typeof name === "string") {
      if (!this.hasActions(name)) {
        return undefined;
      } else {
        return this._actions[name];
      }
    } else {
      return undefined;
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

  abstract getEditorActions(
    project_id: string,
    path: string,
    is_public?: boolean
  );
  abstract getProjectActions(project_id: string);
  abstract getProjectStore(project_id: string);
  abstract getProjectTable(project_id: string, name: string);
  abstract getTable(name: string);
  abstract removeTable(name: string): void;
}
