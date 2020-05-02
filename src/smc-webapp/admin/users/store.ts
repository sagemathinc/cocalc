/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List } from "immutable";

import { Store, TypedMap, redux } from "../../app-framework";
import { User as UserInterface } from "../../frame-editors/generic/client";

export type User = TypedMap<UserInterface>;

export interface StoreState {
  view?: boolean; // if true, open for viewing/editing

  state: "edit" | "running";
  status: string;
  query: string;
  result: List<User>;
}

export const initial_state: StoreState = {
  view: false,
  state: "edit",
  status: "",
  query: "",
  result: List([]),
};

export class AdminUsersStore extends Store<StoreState> {}

export const store = redux.createStore(
  "admin-users",
  AdminUsersStore,
  initial_state
);
