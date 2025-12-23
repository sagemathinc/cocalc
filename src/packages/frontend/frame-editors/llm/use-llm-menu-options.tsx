import { filter } from "lodash";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
  LANGUAGE_MODEL_SERVICES,
  LLMServiceName,
  LLMServicesAvailable,
  LLM_DESCR,
  LLM_PROVIDER,
  LanguageModel,
  MISTRAL_MODELS,
  MODELS_OPENAI,
  XAI_MODELS,
  isLLMServiceName,
  toCustomOpenAIModel,
  toOllamaModel,
  toUserLLMModelName,
} from "@cocalc/util/db-schema/llm-utils";
import { CustomLLMPublic } from "@cocalc/util/types/llm";
import { getCustomLLMGroup } from "./components";
import { LLMModelPrice, modelToName } from "./llm-selector";
import { useUserDefinedLLM } from "./use-userdefined-llm";

interface Model {
  name: LanguageModel;
  title: string;
  desc: string;
  price: React.JSX.Element;
}

// ATTN: when you change this useLLMMenuOptions hook, you also have to change the LLMSelector component
export function useAvailableLLMs(project_id: string) {
  // ATTN: you cannot use useProjectContext because this component is used outside a project context
  // when it is opened via an error in the gutter of a latex document. (I don't know why, maybe fixable)
  const projectsStore = redux.getStore("projects");
  const have = LANGUAGE_MODEL_SERVICES.reduce((cur, svc) => {
    cur[svc] = projectsStore.hasLanguageModelEnabled(
      project_id,
      undefined,
      svc,
    );
    return cur;
  }, {}) as LLMServicesAvailable;
  const ollama = useTypedRedux("customize", "ollama");
  const custom_openai = useTypedRedux("customize", "custom_openai");
  const selectableLLMs = useTypedRedux("customize", "selectable_llms");
  const user_llm = useUserDefinedLLM();

  const providers: {
    [key in LLMServiceName | "custom"]?: {
      name: string | React.JSX.Element;
      desc: string;
      models: Model[];
    };
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

  if (have.openai) add("openai", MODELS_OPENAI);
  if (have.google) add("google", GOOGLE_MODELS);
  if (have.mistralai) add("mistralai", MISTRAL_MODELS);
  if (have.anthropic) add("anthropic", ANTHROPIC_MODELS);
  if (have.xai) add("xai", XAI_MODELS);

  const custom: Model[] = [];
  if (have.ollama && ollama) {
    for (const [key, config] of Object.entries<CustomLLMPublic>(
      ollama.toJS(),
    )) {
      const { display, desc = "" } = config;
      const ollamaModel = toOllamaModel(key);
      custom.push({
        name: ollamaModel,
        title: display,
        desc,
        price: <LLMModelPrice model={ollamaModel} />,
      });
    }
  }

  if (have.custom_openai && custom_openai) {
    for (const [key, config] of Object.entries<CustomLLMPublic>(
      custom_openai.toJS(),
    )) {
      const { display, desc = "" } = config;
      const customOpenAIModel = toCustomOpenAIModel(key);
      custom.push({
        name: customOpenAIModel,
        title: display,
        desc,
        price: <LLMModelPrice model={customOpenAIModel} />,
      });
    }
  }

  if (custom.length > 0) {
    const { title, label } = getCustomLLMGroup();
    providers["custom"] = {
      models: custom,
      name: label,
      desc: title,
    };
  }

  const user: Model[] = [];
  if (user_llm.length > 0) {
    //const text = LLM_PROVIDER.user.desc;
    for (const llm of user_llm) {
      const { display, model, service } = llm;
      if (!isLLMServiceName(service)) continue;
      const um = toUserLLMModelName(llm);
      user.push({
        name: um,
        title: display || model,
        desc: LLM_PROVIDER[service].name,
        price: <LLMModelPrice model={um} />,
      });
    }
  }

  if (user.length > 0) {
    const { title, label } = getCustomLLMGroup();
    providers["user"] = {
      models: user,
      name: label,
      desc: title,
    };
  }

  return providers;
}
