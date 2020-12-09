/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { fromJS, List } from "immutable";

import { Actions, redux } from "../../app-framework";
import { user_search, User } from "../../frame-editors/generic/client";
import { sortBy } from "lodash";
import { StoreState, User as ImmutableUser, store } from "./store";

function user_sort_key(user: User): number {
  if (user.last_active) {
    return -user.last_active.getTime();
  }
  if (user.created) {
    return -user.created.getTime();
  }
  return 0;
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
      query: store.get("query").trim().toLowerCase(), // backend assumes lower case
      admin: true,
      limit: 100,
    });

    if (result == null) {
      this.set_status("ERROR");
      return;
    }

    const result_sorted = sortBy(result, user_sort_key);
    this.set_status("");

    this.setState({
      result: fromJS(result_sorted) as List<ImmutableUser>,
    });
  }

  public set_view(view: boolean): void {
    this.setState({ view });
  }
}

export const actions = redux.createActions("admin-users", AdminUsersActions);
