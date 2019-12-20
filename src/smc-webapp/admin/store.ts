import { Store, TypedMap } from "../app-framework";
import { User as UserInterface } from "smc-webapp/frame-editors/generic/client";

import { List } from "immutable";
export type User = TypedMap<UserInterface>;

export interface AdminStoreState {
  user_search_state: "edit" | "running";
  user_search_status: string;
  user_search_query: string;
  user_search_result: List<User>;
  ab_test_name: string;
  ab_test_err: string;
  ab_test_results: List<any>;
}

export const initial_state: AdminStoreState = {
  user_search_state: "edit",
  user_search_status: "",
  user_search_query: "",
  user_search_result: List([]),
  ab_test_err: "",
  ab_test_name: "sign_up_button",
  ab_test_results: List([])
};

export class AdminStore extends Store<AdminStoreState> {}
