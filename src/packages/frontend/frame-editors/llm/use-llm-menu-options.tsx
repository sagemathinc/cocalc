import { filter } from "lodash";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
  LLMServiceName,
  LLM_DESCR,
  LLM_PROVIDER,
  LanguageModel,
  MISTRAL_MODELS,
  MODELS_OPENAI,
  toOllamaModel,
} from "@cocalc/util/db-schema/llm-utils";
import { LLMModelPrice, modelToName } from "./llm-selector";
import { CustomLLMPublic } from "@cocalc/util/types/llm";

interface Model {
  name: LanguageModel;
  title: string;
  desc: string;
  price: JSX.Element;
}

// ATTN: when you change this useLLMMenuOptions hook, you also have to change the LLMSelector component
export function useAvailableLLMs(project_id: string) {
  // ATTN: you cannot use useProjectContext because this component is used outside a project context
  // when it is opened via an error in the gutter of a latex document. (I don't know why, maybe fixable)
  const projectsStore = redux.getStore("projects");
  const haveOpenAI = projectsStore.hasLanguageModelEnabled(
    project_id,
    undefined,
    "openai",
  );
  const haveGoogle = projectsStore.hasLanguageModelEnabled(
    project_id,
    undefined,
    "google",
  );
  const haveMistral = projectsStore.hasLanguageModelEnabled(
    project_id,
    undefined,
    "mistralai",
  );
  const haveAnthropic = projectsStore.hasLanguageModelEnabled(
    project_id,
    undefined,
    "anthropic",
  );
  const haveOllama = projectsStore.hasLanguageModelEnabled(
    project_id,
    undefined,
    "ollama",
  );
  const ollama = useTypedRedux("customize", "ollama");
  const selectableLLMs = useTypedRedux("customize", "selectable_llms");

  const providers: {
    [key in LLMServiceName]?: { name: string; desc: string; models: Model[] };
  } = {};

  function add(service: LLMServiceName, models) {
    const { name, desc } = LLM_PROVIDER[service];
    providers[service] = {
      name,
      desc,
      models: filter(models, (model: LanguageModel) =>
        selectableLLMs.includes(model),
      ).map((model) => {
        return {
          name: model,
          title: modelToName(model),
          desc: LLM_DESCR[model],
          price: <LLMModelPrice model={model} />,
        };
      }),
    };
  }

  if (haveOpenAI) add("openai", MODELS_OPENAI);
  if (haveGoogle) add("google", GOOGLE_MODELS);
  if (haveMistral) add("mistralai", MISTRAL_MODELS);
  if (haveAnthropic) add("anthropic", ANTHROPIC_MODELS);
  if (haveOllama && ollama) {
    const models: Model[] = [];
    for (const [key, config] of Object.entries<CustomLLMPublic>(ollama.toJS())) {
      const { display, desc = "" } = config;
      const ollamaModel = toOllamaModel(key);
      models.push({
        name: ollamaModel,
        title: display,
        desc,
        price: <LLMModelPrice model={ollamaModel} />,
      });
    }

    providers["ollama"] = {
      models,
      name: "ollama",
      desc: "Ollama",
    };
  }

  return providers;
}
