/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tooltip } from "antd";
import { List } from "immutable";
import { isEmpty } from "lodash";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { redux, useMemo, useTypedRedux } from "@cocalc/frontend/app-framework";
import AnthropicAvatar from "@cocalc/frontend/components/anthropic-avatar";
import GoogleGeminiLogo from "@cocalc/frontend/components/google-gemini-avatar";
import { LanguageModelVendorAvatar } from "@cocalc/frontend/components/language-model-icon";
import MistralAvatar from "@cocalc/frontend/components/mistral-avatar";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import XAIAvatar from "@cocalc/frontend/components/xai-avatar";
import { LLMModelPrice } from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { useUserDefinedLLM } from "@cocalc/frontend/frame-editors/llm/use-userdefined-llm";
import { useProjectContext } from "@cocalc/frontend/project/context";
import {
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
  LLMServicesAvailable,
  LLM_DESCR,
  LLM_USERNAMES,
  LanguageModel,
  MISTRAL_MODELS,
  MODELS_OPENAI,
  UserDefinedLLM,
  fromCustomOpenAIModel,
  fromOllamaModel,
  isCustomOpenAI,
  isOllamaLLM,
  isUserDefinedModel,
  model2service,
  model2vendor,
  toCustomOpenAIModel,
  toOllamaModel,
  toUserLLMModelName,
  XAI_MODELS,
} from "@cocalc/util/db-schema/llm-utils";
import { cmp, timestamp_cmp, trunc_middle } from "@cocalc/util/misc";
import { CustomLLMPublic } from "@cocalc/util/types/llm";
import { Item as CompleteItem } from "./complete";

// we make the show_llm_main_menu field required, to avoid forgetting to set it ;-)
type Item = CompleteItem & Required<Pick<CompleteItem, "show_llm_main_menu">>;

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
  const custom_openai = useTypedRedux("customize", "custom_openai");
  const user_llm = useUserDefinedLLM();

  // the current default model. This is always a valid LLM, even if none has ever been selected.
  const [model] = useLanguageModelSetting();

  return useMemo(() => {
    return (search: string | undefined, opts?: Opts) => {
      return mentionableUsers({
        search,
        project_id,
        enabledLLMs,
        model,
        ollama: ollama?.toJS() ?? {},
        custom_openai: custom_openai?.toJS() ?? {},
        user_llm,
        selectableLLMs,
        opts,
      });
    };
  }, [project_id, JSON.stringify(enabledLLMs), ollama, custom_openai, model]);
}

interface Props {
  search: string | undefined;
  project_id: string;
  model: LanguageModel;
  ollama: { [key: string]: CustomLLMPublic };
  custom_openai: { [key: string]: CustomLLMPublic };
  enabledLLMs: LLMServicesAvailable;
  selectableLLMs: List<string>;
  user_llm: UserDefinedLLM[];
  opts?: Opts;
}

function mentionableUsers({
  search,
  project_id,
  enabledLLMs,
  model,
  ollama,
  custom_openai,
  selectableLLMs,
  user_llm,
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

  const mentions: Item[] = [];

  if (enabledLLMs.openai) {
    // NOTE: all modes are included, including the 16k version, because:
    //       (1) if you use GPT-3.5 too much you hit your limit,
    //       (2) this is a non-free BUT CHEAP model you can actually use after hitting your limit, which is much cheaper than GPT-4.
    for (const moai of MODELS_OPENAI) {
      if (!selectableLLMs.includes(moai)) continue;
      const show_llm_main_menu = moai === model;
      const size = show_llm_main_menu ? avatarUserSize : avatarLLMSize;
      const v = "openai";
      const m = moai.replace(/-/g, "");
      const n = LLM_USERNAMES[moai].replace(/ /g, "");
      const search_term = `${v}chat${m}${n}`.toLowerCase();
      if (!search || search_term.includes(search)) {
        mentions.push({
          value: model2service(moai),
          label: (
            <LLMTooltip model={moai}>
              <OpenAIAvatar size={size} /> {LLM_USERNAMES[moai]}{" "}
              <LLMModelPrice model={moai} floatRight />
            </LLMTooltip>
          ),
          search: search_term,
          is_llm: true,
          show_llm_main_menu,
        });
      }
    }
  }

  if (enabledLLMs.google) {
    for (const m of GOOGLE_MODELS) {
      if (!selectableLLMs.includes(m)) continue;
      const show_llm_main_menu = m === model;
      const size = show_llm_main_menu ? avatarUserSize : avatarLLMSize;
      const v = model2vendor(m);
      const search_term = `${v}${m.replace(/-/g, "").toLowerCase()}`;
      if (!search || search_term.includes(search)) {
        mentions.push({
          value: model2service(m),
          label: (
            <LLMTooltip model={m}>
              <GoogleGeminiLogo size={size} /> {LLM_USERNAMES[m]}{" "}
              <LLMModelPrice model={m} floatRight />
            </LLMTooltip>
          ),
          search: search_term,
          is_llm: true,
          show_llm_main_menu,
        });
      }
    }
  }

  if (enabledLLMs.xai) {
    for (const m of XAI_MODELS) {
      if (!selectableLLMs.includes(m)) continue;
      const show_llm_main_menu = m === model;
      const size = show_llm_main_menu ? avatarUserSize : avatarLLMSize;
      const name = LLM_USERNAMES[m] ?? m;
      const vendor = model2vendor(m);
      const search_term =
        `${vendor.name}${m.replace(/-/g, "")}${name.replace(/ /g, "")}`.toLowerCase();
      if (!search || search_term.includes(search)) {
        mentions.push({
          value: model2service(m),
          label: (
            <LLMTooltip model={m}>
              <XAIAvatar size={size} /> {name}{" "}
              <LLMModelPrice model={m} floatRight />
            </LLMTooltip>
          ),
          search: search_term,
          is_llm: true,
          show_llm_main_menu,
        });
      }
    }
  }

  if (enabledLLMs.mistralai) {
    for (const m of MISTRAL_MODELS) {
      if (!selectableLLMs.includes(m)) continue;
      const show_llm_main_menu = m === model;
      const size = show_llm_main_menu ? avatarUserSize : avatarLLMSize;
      const name = LLM_USERNAMES[m] ?? m;
      const s = model2vendor(m);
      const search_term = `${s}${m}${name}`.toLowerCase();
      if (!search || search_term.includes(search)) {
        mentions.push({
          value: model2service(m),
          label: (
            <LLMTooltip model={m}>
              <MistralAvatar size={size} /> {name}{" "}
              <LLMModelPrice model={m} floatRight />
            </LLMTooltip>
          ),
          search: search_term,
          is_llm: true,
          show_llm_main_menu,
        });
      }
    }
  }

  if (enabledLLMs.anthropic) {
    for (const m of ANTHROPIC_MODELS) {
      if (!selectableLLMs.includes(m)) continue;
      const show_llm_main_menu = m === model;
      const size = show_llm_main_menu ? avatarUserSize : avatarLLMSize;
      const name = LLM_USERNAMES[m] ?? m;
      const s = model2vendor(m);
      const search_term = `${s}${m}${name}`.toLowerCase();
      if (!search || search_term.includes(search)) {
        mentions.push({
          value: model2service(m),
          label: (
            <LLMTooltip model={m}>
              <AnthropicAvatar size={size} /> {name}{" "}
              <LLMModelPrice model={m} floatRight />
            </LLMTooltip>
          ),
          search: search_term,
          is_llm: true,
          show_llm_main_menu,
        });
      }
    }
  }

  if (enabledLLMs.ollama && !isEmpty(ollama)) {
    for (const [m, conf] of Object.entries(ollama)) {
      const show_llm_main_menu =
        isOllamaLLM(model) && m === fromOllamaModel(model);
      const size = show_llm_main_menu ? avatarUserSize : avatarLLMSize;
      const value = toOllamaModel(m);
      const search_term = `${m}${value}${conf.display}`.toLowerCase();
      if (!search || search_term.includes(search)) {
        mentions.push({
          value,
          label: (
            <span>
              <LanguageModelVendorAvatar model={value} size={size} />{" "}
              {conf.display} <LLMModelPrice model={m} floatRight />
            </span>
          ),
          search: search_term,
          is_llm: true,
          show_llm_main_menu,
        });
      }
    }
  }

  if (enabledLLMs.custom_openai && !isEmpty(custom_openai)) {
    for (const [m, conf] of Object.entries(custom_openai)) {
      const show_llm_main_menu =
        isCustomOpenAI(model) && m === fromCustomOpenAIModel(model);
      const size = show_llm_main_menu ? avatarUserSize : avatarLLMSize;
      const value = toCustomOpenAIModel(m);
      const search_term = `${m}${value}${conf.display}`.toLowerCase();
      if (!search || search_term.includes(search)) {
        mentions.push({
          value,
          label: (
            <span>
              <LanguageModelVendorAvatar model={value} size={size} />{" "}
              {conf.display} <LLMModelPrice model={m} floatRight />
            </span>
          ),
          search: search_term,
          is_llm: true,
          show_llm_main_menu,
        });
      }
    }
  }

  if (!isEmpty(user_llm)) {
    for (const llm of user_llm) {
      const m = toUserLLMModelName(llm);
      const show_llm_main_menu = isUserDefinedModel(model) && m === model;
      const size = show_llm_main_menu ? avatarUserSize : avatarLLMSize;
      const value = m;
      const search_term = `${value}${llm.display}`.toLowerCase();
      if (!search || search_term.includes(search)) {
        mentions.push({
          value,
          label: (
            <span>
              <LanguageModelVendorAvatar model={value} size={size} />{" "}
              {llm.display}
            </span>
          ),
          search: search_term,
          is_llm: true,
          show_llm_main_menu,
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
    mentions.push({
      value: account_id,
      label,
      search: s,
      is_llm: false,
      show_llm_main_menu: true, // irrelevant, but that's what it will do for standard user accounts
    });
  }

  return mentions;
}

function LLMTooltip({
  model,
  children,
}: {
  model: string;
  children: React.ReactNode;
}) {
  const descr = LLM_DESCR[model];
  const title = <>{descr}</>;
  return (
    <Tooltip title={title} placement="right">
      <div style={{ width: "100%" }}>{children}</div>
    </Tooltip>
  );
}
