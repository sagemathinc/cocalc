import { redux, useMemo, useTypedRedux } from "@cocalc/frontend/app-framework";
import { getUserDefinedLLM } from "@cocalc/frontend/frame-editors/llm/use-userdefined-llm";
import {
  LLMServicesAvailable,
  LanguageService,
  fromCustomOpenAIModel,
  fromOllamaModel,
  getValidLanguageModelName,
  isCustomOpenAI,
  isOllamaLLM,
  isUserDefinedModel,
  unpackUserDefinedLLMModel,
} from "@cocalc/util/db-schema/llm-utils";

export const SETTINGS_LANGUAGE_MODEL_KEY = "language_model";

// ATTN: it is tempting to use the `useProjectContext` hook here, but it is not possible
// The "AI Formula" dialog is outside the project context (unfortunately)
export function useLanguageModelSetting(
  project_id?: string,
): [LanguageService, (llm: LanguageService) => void] {
  const other_settings = useTypedRedux("account", "other_settings");
  const default_llm = useTypedRedux("customize", "default_llm");
  const ollama = useTypedRedux("customize", "ollama");
  const custom_openai = useTypedRedux("customize", "custom_openai");
  const selectableLLMs = useTypedRedux("customize", "selectable_llms");

  const haveOpenAI = useTypedRedux("customize", "openai_enabled");
  const haveGoogle = useTypedRedux("customize", "google_vertexai_enabled");
  const haveOllama = useTypedRedux("customize", "ollama_enabled");
  const haveCustomOpenAI = useTypedRedux("customize", "custom_openai_enabled");
  const haveMistral = useTypedRedux("customize", "mistral_enabled");
  const haveAnthropic = useTypedRedux("customize", "anthropic_enabled");

  const enabledLLMs: LLMServicesAvailable = useMemo(() => {
    const projectsStore = redux.getStore("projects");
    return projectsStore.whichLLMareEnabled(project_id);
  }, [
    haveOpenAI,
    haveGoogle,
    haveOllama,
    haveCustomOpenAI,
    haveMistral,
    haveAnthropic,
  ]);

  const llm: LanguageService = useMemo(() => {
    return getValidLanguageModelName({
      model: other_settings?.get("language_model") ?? default_llm,
      filter: enabledLLMs,
      ollama: Object.keys(ollama?.toJS() ?? {}),
      custom_openai: Object.keys(custom_openai?.toJS() ?? {}),
      selectable_llms: selectableLLMs?.toJS() ?? [],
    });
  }, [other_settings, custom_openai, ollama, selectableLLMs, enabledLLMs]);

  function setLLM(llm: LanguageService) {
    setDefaultLLM(llm);
  }

  return [llm, setLLM];
}

// This changes the account's default LLM
export function setDefaultLLM(llm: LanguageService) {
  const customizeStore = redux.getStore("customize");
  const selectableLLMs = customizeStore.get("selectable_llms");
  const ollama = customizeStore.get("ollama");
  const custom_openai = customizeStore.get("custom_openai");

  if (selectableLLMs.includes(llm as any)) {
    redux
      .getActions("account")
      .set_other_settings(SETTINGS_LANGUAGE_MODEL_KEY, llm);
  } else if (isOllamaLLM(llm) && ollama?.get(fromOllamaModel(llm))) {
    // check if LLM is a key in the Ollama TypedMap
    redux
      .getActions("account")
      .set_other_settings(SETTINGS_LANGUAGE_MODEL_KEY, llm);
  } else if (
    isCustomOpenAI(llm) &&
    custom_openai?.get(fromCustomOpenAIModel(llm))
  ) {
    redux
      .getActions("account")
      .set_other_settings(SETTINGS_LANGUAGE_MODEL_KEY, llm);
  } else if (isUserDefinedModel(llm) && userDefinedLLMExists(llm)) {
    redux
      .getActions("account")
      .set_other_settings(SETTINGS_LANGUAGE_MODEL_KEY, llm);
  } else {
    console.warn(`setDefaultLLM: LLM "${llm}" is unknown.`);
  }
}

function userDefinedLLMExists(model: string): boolean {
  const user_llm = getUserDefinedLLM();
  const um = unpackUserDefinedLLMModel(model);
  if (um == null) return false;
  return user_llm.some((m) => m.service === um.service && m.model === um.model);
}
