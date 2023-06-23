/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux } from "../../app-framework";
import { Item } from "./complete";
import { trunc_middle, timestamp_cmp, cmp } from "@cocalc/util/misc";
import { Avatar } from "../../account/avatar/avatar";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import { OPENAI_USERNAMES } from "@cocalc/util/db-schema/openai";

export function mentionableUsers(
  project_id: string,
  search?: string,
  chatGPT?: boolean
): Item[] {
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
  if (chatGPT) {
    if (!search || "chatgpt3".includes(search)) {
      v.push({
        value: "openai-gpt-3.5-turbo",
        label: (
          <span>
            <OpenAIAvatar size={24} /> {OPENAI_USERNAMES["gpt-3.5-turbo"]}
          </span>
        ),
        search: "chatgpt3",
      });
      // Realistically it's maybe really unlikely to want to use this in a new chat
      // you're making...? This did work when I wrote it, but I'm commenting it
      // out since I think it's just not worth it.
      /*
      v.push({
        value: "openai-gpt-3.5-turbo-16k",
        label: (
          <span>
            <OpenAIAvatar size={24} /> {OPENAI_USERNAMES["gpt-3.5-turbo-16k"]}
          </span>
        ),
        search: "chatgpt3",
      });
      */
    }
    if (!search || "chatgpt4".includes(search)) {
      v.push({
        value: "openai-gpt-4",
        label: (
          <span>
            <OpenAIAvatar size={24} /> {OPENAI_USERNAMES["gpt-4"]}
          </span>
        ),
        search: "chatgpt4",
      });
    }
  }
  for (const { account_id } of project_users) {
    const fullname = users_store.get_name(account_id) ?? "";
    const s = fullname.toLowerCase();
    if (search != null && s.indexOf(search) == -1) continue;
    const name = trunc_middle(fullname, 64);
    const label = (
      <span>
        <Avatar account_id={account_id} size={24} /> {name}
      </span>
    );
    v.push({ value: account_id, label, search: s });
  }
  return v;
}
