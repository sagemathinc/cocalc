import { redux, useMemo, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  LanguageModel,
  USER_SELECTABLE_LANGUAGE_MODELS,
  fromOllamaModel,
  getValidLanguageModelName,
  isOllamaLLM,
} from "@cocalc/util/db-schema/openai";

export const SETTINGS_LANGUAGE_MODEL_KEY = "language_model";

export function useLanguageModelSetting(): [
  LanguageModel | string,
  (llm: LanguageModel | string) => void,
] {
  const other_settings = useTypedRedux("account", "other_settings");
  const ollama = useTypedRedux("customize", "ollama");
  const haveOpenAI = useTypedRedux("customize", "openai_enabled");
  const haveGoogle = useTypedRedux("customize", "google_vertexai_enabled");
  const haveOllama = useTypedRedux("customize", "ollama_enabled");

  const filter = useMemo(() => {
    const projectsStore = redux.getStore("projects");
    return projectsStore.llmEnabledSummary();
  }, [haveOpenAI, haveGoogle, haveOllama]);

  const llm = useMemo(() => {
    return getValidLanguageModelName(
      other_settings?.get("language_model"),
      filter,
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
