/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { redux } from "@cocalc/frontend/app-framework";
import GoogleGeminiLogo from "@cocalc/frontend/components/google-gemini-avatar";
import GooglePalmLogo from "@cocalc/frontend/components/google-palm-avatar";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import {
  LLM_USERNAMES,
  USER_SELECTABLE_LANGUAGE_MODELS,
  model2service,
} from "@cocalc/util/db-schema/llm";
import { cmp, timestamp_cmp, trunc_middle } from "@cocalc/util/misc";
import { Item } from "./complete";

export function mentionableUsers(
  project_id: string,
  search: string | undefined,
  chatGPT: boolean | undefined,
  vertexAI: boolean | undefined,
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
    if (USER_SELECTABLE_LANGUAGE_MODELS.includes("gpt-3.5-turbo")) {
      if (!search || "chatgpt3".includes(search)) {
        v.push({
          value: "openai-gpt-3.5-turbo",
          label: (
            <span>
              <OpenAIAvatar size={24} /> {LLM_USERNAMES["gpt-3.5-turbo"]}
            </span>
          ),
          search: "chatgpt3",
        });
      }
      if (!search || "chatgpt3".includes(search)) {
        // Realistically it's maybe really unlikely to want to use this in a new chat
        // you're making...? This did work when I wrote it, but I'm commenting it
        // out since I think it's just not worth it.
        // I'm adding this back because: (1) if you use GPT-3.5 too much you hit your limit,
        // and (2) this is a non-free BUT CHEAP model you can actually use after hitting your
        // limit, which is muh cheaper than GPT-4.
        v.push({
          value: "openai-gpt-3.5-turbo-16k",
          label: (
            <span>
              <OpenAIAvatar size={24} /> {LLM_USERNAMES["gpt-3.5-turbo-16k"]}
            </span>
          ),
          search: "chatgpt3-16k",
        });
      }
    }
    if (USER_SELECTABLE_LANGUAGE_MODELS.includes("gpt-4")) {
      if (!search || "chatgpt4".includes(search)) {
        v.push({
          value: "openai-gpt-4",
          label: (
            <span>
              <OpenAIAvatar size={24} /> {LLM_USERNAMES["gpt-4"]}
            </span>
          ),
          search: "chatgpt4",
        });
      }
    }
  }

  if (vertexAI) {
    if (USER_SELECTABLE_LANGUAGE_MODELS.includes("chat-bison-001")) {
      if (!search || "palm".includes(search)) {
        v.push({
          value: model2service("chat-bison-001"),
          label: (
            <span>
              <GooglePalmLogo size={24} /> {LLM_USERNAMES["chat-bison-001"]}
            </span>
          ),
          search: "palm",
        });
      }
    }

    if (USER_SELECTABLE_LANGUAGE_MODELS.includes("gemini-pro")) {
      if (!search || "gemini".includes(search)) {
        v.push({
          value: model2service("gemini-pro"),
          label: (
            <span>
              <GoogleGeminiLogo size={24} /> {LLM_USERNAMES["gemini-pro"]}
            </span>
          ),
          search: "gemini",
        });
      }
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
