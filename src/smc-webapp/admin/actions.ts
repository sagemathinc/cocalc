import { Actions } from "../app-framework";
import { user_search, User } from "smc-webapp/frame-editors/generic/client";
import { cmp } from "smc-webapp/frame-editors/generic/misc";
import { AdminStoreState } from "./store"

function user_sort_key(user: User): string {
  if (user.last_active) {
    return user.last_active;
  }
  if (user.created) {
    return user.created;
  }
  return "";
}

export class AdminActions extends Actions<AdminStoreState> {
  public store: any;

  set_user_search_query = (query: string): void => {
    this.setState({ user_search_query: query });
  }

  clear_user_search_status = (): void => {
    this.setState({ user_search_status: "" });
  };

  set_user_search_status = (status: string): void => {
    this.setState({ user_search_status: status });
  };

  fetch_for_user_search = async (): Promise<void> => {
    this.set_user_search_status("Searching...");

    /*
    yield call(user_search, {
      query: this.store.get("user_search_query"),
      admin: true,
      limit: 100
    });
    */

    const result: User[] = await user_search({
      query: this.store.get("user_search_query"),
      admin: true,
      limit: 100
    });

    if (!result) {
      this.set_user_search_status("ERROR");
      return;
    }

    //(window as any).result = result;
    result.sort(function(a, b) {
      return -cmp(user_sort_key(a), user_sort_key(b));
    });
    this.set_user_search_status("");

    this.setState({ user_search_result: result });
  };
}
