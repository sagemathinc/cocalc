import { redux, useMemo, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  LanguageModel,
  USER_SELECTABLE_LANGUAGE_MODELS,
  getValidLanguageModelName,
} from "@cocalc/util/db-schema/openai";

export const SETTINGS_LANGUAGE_MODEL_KEY = "language_model";

export function useLanguageModelSetting(): [
  LanguageModel,
  (llm: LanguageModel) => void,
] {
  const other_settings = useTypedRedux("account", "other_settings");
  const llm = useMemo(() => {
    return getValidLanguageModelName(other_settings?.get("language_model"));
  }, [other_settings]);

  function setLLM(llm: LanguageModel) {
    if (USER_SELECTABLE_LANGUAGE_MODELS.includes(llm as any)) {
      redux
        .getActions("account")
        .set_other_settings(SETTINGS_LANGUAGE_MODEL_KEY, llm);
    }
  }

  return [llm, setLLM];
}
