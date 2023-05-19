import type { Actions } from "./Actions";
import type { Store } from "./Store";

export interface AppRedux {
  _redux_store: any;
  _set_state(change, store_name: string): void;

  createActions<T, C extends Actions<T>>(
    name: string,
    actions_class?: new (a, b) => C
  ): C;
  getActions(name);
  removeActions(name: string): void;
  getEditorActions(project_id: string, path: string, is_public?: boolean);

  getProjectActions(project_id: string);
  getProjectStore(project_id: string);
  getProjectTable(project_id: string, name: string);

  getTable(name: string);
  removeTable(name: string): void;

  createStore(name: string, store_class?, init?);
  createStore<State, C>(name: string, store_class?, init?: {} | State): C;
  hasStore(name: string): boolean;
  getStore(name: string);
  getStore<State extends Record<string, any>, C extends Store<State>>(
    name: string
  ): C | undefined;
  removeStore(name: string): void;
}
