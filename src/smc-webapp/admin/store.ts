/* TODO: this is done badly, as is clear from having to put user_search prefixes everywhere.
This approach is awkward and is designed to tangle up a bunch of unrelated code, which is always
a bad idea.

Instead there should be actions and a store specific in the user/ subdirectory.  See how it's
done much better by looking at site-licenses/
*/

import { Store, TypedMap } from "../app-framework";
import { User as UserInterface } from "smc-webapp/frame-editors/generic/client";

import { List } from "immutable";
export type User = TypedMap<UserInterface>;

export interface AdminStoreState {
  user_search_state: "edit" | "running";
  user_search_status: string;
  user_search_query: string;
  user_search_result: List<User>;
}

export const initial_state: AdminStoreState = {
  user_search_state: "edit",
  user_search_status: "",
  user_search_query: "",
  user_search_result: List([])
};

export class AdminStore extends Store<AdminStoreState> {}
