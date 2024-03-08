import { redux, useMemo, useTypedRedux } from "@cocalc/frontend/app-framework";
import { EnabledLLMs } from "@cocalc/frontend/project/context";
import {
  LanguageModel,
  USER_SELECTABLE_LANGUAGE_MODELS,
  fromOllamaModel,
  getValidLanguageModelName,
  isOllamaLLM,
} from "@cocalc/util/db-schema/llm";

export const SETTINGS_LANGUAGE_MODEL_KEY = "language_model";

// ATTN: it is tempting to use the `useProjectContext` hook here, but it is not possible
// The "AI Formula" dialog is outside the project context (unfortunately)
export function useLanguageModelSetting(
  project_id?: string,
): [LanguageModel | string, (llm: LanguageModel | string) => void] {
  const other_settings = useTypedRedux("account", "other_settings");
  const ollama = useTypedRedux("customize", "ollama");

  const haveOpenAI = useTypedRedux("customize", "openai_enabled");
  const haveGoogle = useTypedRedux("customize", "google_vertexai_enabled");
  const haveOllama = useTypedRedux("customize", "ollama_enabled");

  const enabledLLMs: EnabledLLMs = useMemo(() => {
    const projectsStore = redux.getStore("projects");
    return projectsStore.whichLLMareEnabled(project_id);
  }, [haveOpenAI, haveGoogle, haveOllama]);

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
