/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { fromJS, List } from "immutable";

import { Actions, redux } from "../../app-framework";
import { user_search, User } from "../../frame-editors/generic/client";
import { cmp } from "smc-util/misc2";
import { StoreState, User as ImmutableUser, store } from "./store";

function user_sort_key(user: User): string {
  if (user.last_active) {
    return user.last_active;
  }
  if (user.created) {
    return user.created;
  }
  return "";
}

export class AdminUsersActions extends Actions<StoreState> {
  public set_query(query: string): void {
    this.setState({ query: query });
  }

  public clear_status(): void {
    this.setState({ status: "" });
  }

  public set_status(status: string): void {
    this.setState({ status: status });
  }

  public async search(): Promise<void> {
    this.set_status("Searching...");

    const result = await user_search({
      query: store.get("query"),
      admin: true,
      limit: 100,
    });

    if (result == null) {
      this.set_status("ERROR");
      return;
    }

    result.sort(function (a, b) {
      return -cmp(user_sort_key(a), user_sort_key(b));
    });
    this.set_status("");

    this.setState({
      result: fromJS(result) as List<ImmutableUser>,
    });
  }

  public set_view(view: boolean): void {
    this.setState({ view });
  }
}

export const actions = redux.createActions("admin-users", AdminUsersActions);
