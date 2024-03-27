/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Tooltip } from "antd";
import { List } from "immutable";
import { isEmpty } from "lodash";

import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { redux, useMemo, useTypedRedux } from "@cocalc/frontend/app-framework";
import GoogleGeminiLogo from "@cocalc/frontend/components/google-gemini-avatar";
import MistralAvatar from "@cocalc/frontend/components/mistral-avatar";
import OllamaAvatar from "@cocalc/frontend/components/ollama-avatar";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import { LLMModelPrice } from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { useProjectContext } from "@cocalc/frontend/project/context";
import {
  LLMServicesAvailable,
  LLM_DESCR,
  LLM_USERNAMES,
  MISTRAL_MODELS,
  model2service,
  toOllamaModel,
} from "@cocalc/util/db-schema/llm-utils";
import { cmp, timestamp_cmp, trunc_middle } from "@cocalc/util/misc";
import { OllamaPublic } from "@cocalc/util/types/llm";
import { Item } from "./complete";

interface Opts {
  avatarUserSize?: number;
  avatarLLMSize?: number;
}

export function useMentionableUsers(): (
  search: string | undefined,
  opts?: Opts,
) => Item[] {
  const { project_id, enabledLLMs } = useProjectContext();

  const selectableLLMs = useTypedRedux("customize", "selectable_llms");

  const ollama = useTypedRedux("customize", "ollama");

  return useMemo(() => {
    return (search: string | undefined, opts?: Opts) => {
      return mentionableUsers({
        search,
        project_id,
        enabledLLMs,
        ollama: ollama?.toJS() ?? {},
        selectableLLMs,
        opts,
      });
    };
  }, [project_id, JSON.stringify(enabledLLMs), ollama]);
}

interface Props {
  search: string | undefined;
  project_id: string;
  ollama: { [key: string]: OllamaPublic };
  enabledLLMs: LLMServicesAvailable;
  selectableLLMs: List<string>;
  opts?: Opts;
}

function mentionableUsers({
  search,
  project_id,
  enabledLLMs,
  ollama,
  selectableLLMs,
  opts,
}: Props): Item[] {
  const { avatarUserSize = 24, avatarLLMSize = 24 } = opts ?? {};

  const users = redux
    .getStore("projects")
    .getIn(["project_map", project_id, "users"]);

  const last_active = redux
    .getStore("projects")
    .getIn(["project_map", project_id, "last_active"]);

  if (users == null || last_active == null) return []; // e.g., for an admin

  const my_account_id = redux.getStore("account").get("account_id");

  function getProjectUsers() {
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
    return project_users;
  }

  const project_users = getProjectUsers();

  const users_store = redux.getStore("users");
  const v: Item[] = [];

  if (enabledLLMs.openai) {
    if (selectableLLMs.includes("gpt-3.5-turbo")) {
      if (!search || "chatgpt3".includes(search)) {
        v.push({
          value: "openai-gpt-3.5-turbo",
          label: (
            <LLMTooltip model={"gpt-3.5-turbo"}>
              <OpenAIAvatar size={avatarLLMSize} />{" "}
              {LLM_USERNAMES["gpt-3.5-turbo"]}
            </LLMTooltip>
          ),
          search: "chatgpt3",
          is_llm: true,
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
            <LLMTooltip model={"gpt-3.5-turbo-16k"}>
              <OpenAIAvatar size={avatarLLMSize} />{" "}
              {LLM_USERNAMES["gpt-3.5-turbo-16k"]}
            </LLMTooltip>
          ),
          search: "chatgpt3-16k",
          is_llm: true,
        });
      }
    }

    if (selectableLLMs.includes("gpt-4")) {
      if (!search || "chatgpt4".includes(search)) {
        v.push({
          value: "openai-gpt-4",
          label: (
            <LLMTooltip model={"gpt-4"}>
              <OpenAIAvatar size={avatarLLMSize} /> {LLM_USERNAMES["gpt-4"]}
            </LLMTooltip>
          ),
          search: "chatgpt4",
          is_llm: true,
        });
      }
    }

    if (selectableLLMs.includes("gpt-4-turbo-preview")) {
      if (!search || "chatgpt4turbo".includes(search)) {
        v.push({
          value: "openai-gpt-4-turbo-preview",
          label: (
            <LLMTooltip model={"gpt-4-turbo-preview"}>
              <OpenAIAvatar size={avatarLLMSize} />{" "}
              {LLM_USERNAMES["gpt-4-turbo-preview"]}
            </LLMTooltip>
          ),
          search: "chatgpt4turbo",
          is_llm: true,
        });
      }
    }

    if (selectableLLMs.includes("gpt-4-turbo-preview-8k")) {
      if (!search || "chatgpt4turbo".includes(search)) {
        v.push({
          value: "openai-gpt-4-turbo-preview-8k",
          label: (
            <LLMTooltip model={"gpt-4-turbo-preview-8k"}>
              <OpenAIAvatar size={avatarLLMSize} />{" "}
              {LLM_USERNAMES["gpt-4-turbo-preview-8k"]}
            </LLMTooltip>
          ),
          search: "chatgpt4turbo",
          is_llm: true,
        });
      }
    }
  }

  if (enabledLLMs.google) {
    if (selectableLLMs.includes("gemini-pro")) {
      const search_term = "gemini-pro";
      if (!search || search_term.includes(search)) {
        v.push({
          value: model2service("gemini-pro"),
          label: (
            <LLMTooltip model={"gemini-pro"}>
              <GoogleGeminiLogo size={avatarLLMSize} />{" "}
              {LLM_USERNAMES["gemini-pro"]}
            </LLMTooltip>
          ),
          search: search_term,
          is_llm: true,
        });
      }
    }
  }

  if (enabledLLMs.ollama && !isEmpty(ollama)) {
    for (const [key, conf] of Object.entries(ollama)) {
      const value = toOllamaModel(key);
      const search_term = `${key} ${value} ${conf.display}`.toLowerCase();
      if (!search || search_term.includes(search)) {
        v.push({
          value,
          label: (
            <span>
              <OllamaAvatar size={avatarLLMSize} /> {conf.display}
            </span>
          ),
          search: search_term,
          is_llm: true,
        });
      }
    }
  }

  if (enabledLLMs.mistral) {
    for (const m of MISTRAL_MODELS) {
      if (!selectableLLMs.includes(m)) continue;
      const name = LLM_USERNAMES[m] ?? m;
      const search_term = `${m} ${name}`.toLowerCase();
      if (!search || search_term.includes(search)) {
        v.push({
          value: model2service(m),
          label: (
            <LLMTooltip model={m}>
              <MistralAvatar size={avatarLLMSize} /> {name}
            </LLMTooltip>
          ),
          search: search_term,
          is_llm: true,
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
        <Avatar account_id={account_id} size={avatarUserSize} /> {name}
      </span>
    );
    v.push({ value: account_id, label, search: s, is_llm: false });
  }

  return v;
}

function LLMTooltip({
  model,
  children,
}: {
  model: string;
  children: React.ReactNode;
}) {
  const descr = LLM_DESCR[model];
  const title = (
    <>
      {descr} <LLMModelPrice model={model} />
    </>
  );
  return (
    <Tooltip title={title} placement="right">
      <div>{children}</div>
    </Tooltip>
  );
}
