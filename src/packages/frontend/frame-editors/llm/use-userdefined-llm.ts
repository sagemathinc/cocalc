import { redux, useMemo, useTypedRedux } from "@cocalc/frontend/app-framework";
import { OTHER_SETTINGS_USER_DEFINED_LLM } from "@cocalc/util/db-schema/defaults";
import {
  UserDefinedLLM,
  unpackUserDefinedLLMModel,
} from "@cocalc/util/db-schema/llm-utils";

export function useUserDefinedLLM(): UserDefinedLLM[] {
  const user_defined_llm = useTypedRedux("customize", "user_defined_llm");
  const other_settings = useTypedRedux("account", "other_settings");
  return useMemo(() => {
    if (!user_defined_llm) return [];
    return processUserDefinedLLM(other_settings);
  }, [other_settings]);
}

export function getUserDefinedLLM(): UserDefinedLLM[] {
  const user_defined_llm = redux.getStore("customize").get("user_defined_llm");
  if (!user_defined_llm) return [];

  const other_settings = redux.getStore("account").get("other_settings");
  return processUserDefinedLLM(other_settings);
}

function processUserDefinedLLM(other_settings): UserDefinedLLM[] {
  const val = other_settings.get(OTHER_SETTINGS_USER_DEFINED_LLM) ?? "[]";
  try {
    return JSON.parse(val) as UserDefinedLLM[];
  } catch {
    console.warn("unable to parse custom llm data:", val);
    return [];
  }
}

// @model is the full service string, "user-[service]-[model]" used in the UI
export function getUserDefinedLLMByModel(model: string): UserDefinedLLM | null {
  const user_llm = getUserDefinedLLM();
  const um = unpackUserDefinedLLMModel(model);
  if (um == null) return null;

  for (const llm of user_llm) {
    if (llm.service === um.service && llm.model === um.model) {
      return llm;
    }
  }

  return null;
}
