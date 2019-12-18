import { Actions } from "../app-framework";
import { user_search, User } from "smc-webapp/frame-editors/generic/client";
import { cmp } from "smc-util/misc2";
import { AdminStoreState, User as ImmutableUser } from "./store";
import { fromJS, List } from "immutable";
import { get_ab_test } from "./ab-test";

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
  };

  clear_user_search_status = (): void => {
    this.setState({ user_search_status: "" });
  };

  set_user_search_status = (status: string): void => {
    this.setState({ user_search_status: status });
  };

  set_ab_test_name = (name: string): void => {
    this.setState({ ab_test_name: name });
  };

  fetch_ab_test = async (): void => {
    const [ err, result ] = await get_ab_test(
      this.store.get("ab_test_name")
    );
    if (err) {
      this.setState({ ab_test_err: err ?? "" });
    }
    this.setState({ ab_test_results: result });
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

    const result = await user_search({
      query: this.store.get("user_search_query"),
      admin: true,
      limit: 100
    });

    if (result == null) {
      this.set_user_search_status("ERROR");
      return;
    }

    //(window as any).result = result;
    result.sort(function(a, b) {
      return -cmp(user_sort_key(a), user_sort_key(b));
    });
    this.set_user_search_status("");

    this.setState({
      user_search_result: fromJS(result) as List<ImmutableUser>
    });
  };
}
