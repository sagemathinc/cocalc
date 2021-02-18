/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, redux } from "../../app-framework";
import { Item } from "./complete";

import { trunc_middle, timestamp_cmp, cmp } from "smc-util/misc";
import { Avatar } from "../../account/avatar/avatar";

export function mentionableUsers(project_id: string): Item[] {
  const users = redux
    .getStore("projects")
    .getIn(["project_map", project_id, "users"]);
  const last_active = redux
    .getStore("projects")
    .getIn(["project_map", project_id, "last_active"]);
  if (users == null || last_active == null) return []; // e.g., for an admin
  const my_account_id = redux.getStore("account").get("account_id");
  const project_users: {
    account_id: string;
    last_active: Date | undefined;
  }[] = [];
  for (const [account_id] of users) {
    project_users.push({
      account_id,
      last_active: last_active.get(account_id),
    });
  }
  project_users.sort((a, b) => {
    // always push self to bottom...
    if (a.account_id == my_account_id) {
      return 1;
    }
    if (b.account_id == my_account_id) {
      return -1;
    }
    if (a == null || b == null) return cmp(a.account_id, b.account_id);
    if (a == null && b != null) return 1;
    if (a != null && b == null) return -1;
    return timestamp_cmp(a, b, "last_active");
  });

  const users_store = redux.getStore("users");
  const v: Item[] = [];
  for (const { account_id } of project_users) {
    const name = trunc_middle(users_store.get_name(account_id), 64);
    const elt = (
      <span>
        <Avatar account_id={account_id} size={24} /> {name}
      </span>
    );
    v.push({ value: account_id, elt, search: name.toLowerCase() });
  }
  return v;
}
