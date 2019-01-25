import { Store } from "../app-framework";
import { User } from "smc-webapp/frame-editors/generic/client";

export interface AdminStoreState {
  user_search_state: "edit" | "running";
  user_search_status: string;
  user_search_query: string;
  user_search_result: User[];
}

export const initial_state: AdminStoreState = {
  user_search_state: "edit",
  user_search_status: "",
  user_search_query: "",
  user_search_result: []
};

export class AdminStore extends Store<AdminStoreState> {}
