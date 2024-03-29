import type { SelectProps } from "antd";
import { Select, Tag, Tooltip } from "antd";
import type { ConfigProviderProps } from "antd/lib/config-provider";

import { CSS, redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { LanguageModelVendorAvatar } from "@cocalc/frontend/components/language-model-icon";
import {
  DEFAULT_MODEL,
  LLM_DESCR,
  LLM_USERNAMES,
  LanguageModel,
  MISTRAL_MODELS,
  USER_SELECTABLE_LANGUAGE_MODELS,
  fromOllamaModel,
  isFreeModel,
  isOllamaLLM,
  model2service,
  toOllamaModel,
} from "@cocalc/util/db-schema/llm-utils";
import type { OllamaPublic } from "@cocalc/util/types/llm";

export { DEFAULT_MODEL };
export type { LanguageModel };

type SizeType = ConfigProviderProps["componentSize"];

interface Props {
  model: LanguageModel;
  setModel: (model: LanguageModel) => void;
  size?: SizeType;
  style?: CSS;
  project_id?: string;
}

// The tooltips below are adopted from chat.openai.com

const GOOGLE_GEMINI: LanguageModel = "gemini-pro";

export default function ModelSwitch({
  style,
  model,
  setModel,
  size = "middle",
  project_id,
}: Props) {
  // ATTN: you cannot use useProjectContext because this component is used outside a project context
  // when it is opened via an error in the gutter of a latex document. (I don't know why, maybe fixable)
  const projectsStore = redux.getStore("projects");
  const showOpenAI = projectsStore.hasLanguageModelEnabled(
    project_id,
    undefined,
    "openai",
  );
  const showGoogle = projectsStore.hasLanguageModelEnabled(
    project_id,
    undefined,
    "google",
  );
  const showMistral = projectsStore.hasLanguageModelEnabled(
    project_id,
    undefined,
    "mistralai",
  );
  const showOllama = projectsStore.hasLanguageModelEnabled(
    project_id,
    undefined,
    "ollama",
  );
  const ollama = useTypedRedux("customize", "ollama");

  function getPrice(btnModel): JSX.Element {
    return isFreeModel(btnModel) ? (
      <Tag color="success">free</Tag>
    ) : (
      <Tag color="error">paid</Tag>
    );
  }

  function makeLLMOption(
    ret: NonNullable<SelectProps["options"]>,
    btnModel: LanguageModel,
    title: string,
  ) {
    if (!USER_SELECTABLE_LANGUAGE_MODELS.includes(btnModel as any)) return;
    if (typeof btnModel !== "string") return;

    const model = (
      <>
        <strong>{modelToName(btnModel)}</strong> {getPrice(btnModel)}
      </>
    );
    const tooltip = (
      <>
        <strong>{model}</strong> – {title}
      </>
    );
    const display = (
      <>
        <LanguageModelVendorAvatar model={btnModel} /> {tooltip}
      </>
    );
    ret.push({
      value: btnModel,
      display,
      label: <Tooltip title={tooltip}>{display}</Tooltip>,
    });
  }

  function appendOpenAI(ret: NonNullable<SelectProps["options"]>) {
    if (!showOpenAI) return null;

    makeLLMOption(ret, "gpt-3.5-turbo", LLM_DESCR["gpt-3.5-turbo"]);
    makeLLMOption(ret, "gpt-3.5-turbo-16k", LLM_DESCR["gpt-3.5-turbo-16k"]);
    makeLLMOption(ret, "gpt-4", LLM_DESCR["gpt-4"]);
    makeLLMOption(
      ret,
      "gpt-4-turbo-preview-8k",
      LLM_DESCR["gpt-4-turbo-preview-8k"],
    );
    makeLLMOption(ret, "gpt-4-turbo-preview", LLM_DESCR["gpt-4-turbo-preview"]);
  }

  function appendGoogle(ret: NonNullable<SelectProps["options"]>) {
    if (!showGoogle) return null;

    return <>{makeLLMOption(ret, GOOGLE_GEMINI, LLM_DESCR[GOOGLE_GEMINI])}</>;
  }

  function appendMistral(ret: NonNullable<SelectProps["options"]>) {
    if (!showMistral) return null;

    return (
      <>
        {makeLLMOption(ret, MISTRAL_MODELS[0], LLM_DESCR[MISTRAL_MODELS[0]])}
        {makeLLMOption(ret, MISTRAL_MODELS[1], LLM_DESCR[MISTRAL_MODELS[1]])}
        {makeLLMOption(ret, MISTRAL_MODELS[2], LLM_DESCR[MISTRAL_MODELS[2]])}
      </>
    );
  }

  function appendOllama(ret: NonNullable<SelectProps["options"]>) {
    if (!showOllama || !ollama) return null;

    for (const [key, config] of Object.entries<OllamaPublic>(ollama.toJS())) {
      const { display, desc } = config;
      const ollamaModel = toOllamaModel(key);
      const text = (
        <>
          <strong>{display}</strong> {getPrice(ollamaModel)} –{" "}
          {desc ?? "Ollama"}
        </>
      );
      ret.push({
        value: ollamaModel,
        display: (
          <>
            <LanguageModelVendorAvatar model={ollamaModel} />{" "}
            <strong>{modelToName(ollamaModel)}</strong> {getPrice(ollamaModel)}
          </>
        ),
        label: (
          <Tooltip title={text}>
            <LanguageModelVendorAvatar model={ollamaModel} /> {text}
          </Tooltip>
        ),
      });
    }
  }

  function getOptions(): SelectProps["options"] {
    const ret: NonNullable<SelectProps["options"]> = [];
    appendOpenAI(ret);
    appendGoogle(ret);
    appendMistral(ret);
    appendOllama(ret);
    return ret;
  }

  // all models selectable here must be in util/db-schema/openai::USER_SELECTABLE_LANGUAGE_MODELS + the custom ones from the ollama configuration
  return (
    <Select
      dropdownStyle={style}
      size={size}
      value={model}
      onChange={setModel}
      style={{ width: 300 }}
      optionLabelProp={"display"}
      popupMatchSelectWidth={false}
      options={getOptions()}
    />
  );
}

export function modelToName(model: LanguageModel): string {
  if (isOllamaLLM(model)) {
    const ollama = redux.getStore("customize").get("ollama")?.toJS() ?? {};
    const om = ollama[fromOllamaModel(model)];
    return om ? om.display : `Ollama ${model}`;
  }
  return LLM_USERNAMES[model] ?? model;
}

export function modelToMention(model: LanguageModel): string {
  return `<span class="user-mention" account-id=${model2service(
    model,
  )} >@${modelToName(model)}</span>`;
}
