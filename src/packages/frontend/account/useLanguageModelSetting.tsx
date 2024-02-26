import { redux, useMemo, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  LanguageModel,
  USER_SELECTABLE_LANGUAGE_MODELS,
  fromOllamaModel,
  getValidLanguageModelName,
  isOllamaLLM,
} from "@cocalc/util/db-schema/llm";
import { useProjectContext } from "../project/context";

export const SETTINGS_LANGUAGE_MODEL_KEY = "language_model";

// ATTN: requires the project context
export function useLanguageModelSetting(): [
  LanguageModel | string,
  (llm: LanguageModel | string) => void,
] {
  const other_settings = useTypedRedux("account", "other_settings");
  const ollama = useTypedRedux("customize", "ollama");

  const { enabledLLMs } = useProjectContext();

  const llm = useMemo(() => {
    return getValidLanguageModelName(
      other_settings?.get("language_model"),
      enabledLLMs,
      Object.keys(ollama?.toJS() ?? {}),
    );
  }, [other_settings]);

  function setLLM(llm: LanguageModel | string) {
    if (USER_SELECTABLE_LANGUAGE_MODELS.includes(llm as any)) {
      redux
        .getActions("account")
        .set_other_settings(SETTINGS_LANGUAGE_MODEL_KEY, llm);
    }

    // check if llm is a key in the ollama typedmap
    if (isOllamaLLM(llm) && ollama?.get(fromOllamaModel(llm))) {
      redux
        .getActions("account")
        .set_other_settings(SETTINGS_LANGUAGE_MODEL_KEY, llm);
    }
  }

  return [llm, setLLM];
}
