import type { SelectProps } from "antd";
import { Select, Tag, Tooltip } from "antd";
import type { ConfigProviderProps } from "antd/lib/config-provider";

import { CSS, redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { LanguageModelVendorAvatar } from "@cocalc/frontend/components/language-model-icon";
import {
  ANTHROPIC_MODELS,
  DEFAULT_MODEL,
  GOOGLE_MODELS,
  LLMServiceName,
  LLM_DESCR,
  LLM_PROVIDER,
  LLM_USERNAMES,
  LanguageModel,
  MISTRAL_MODELS,
  MODELS_OPENAI,
  fromOllamaModel,
  isFreeModel,
  isOllamaLLM,
  model2service,
  toOllamaModel,
} from "@cocalc/util/db-schema/llm-utils";
import type { OllamaPublic } from "@cocalc/util/types/llm";
import { Text } from "../../components";

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

export default function LLMSelector({
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
  const showAnthropic = projectsStore.hasLanguageModelEnabled(
    project_id,
    undefined,
    "anthropic",
  );
  const showOllama = projectsStore.hasLanguageModelEnabled(
    project_id,
    undefined,
    "ollama",
  );
  const ollama = useTypedRedux("customize", "ollama");
  const selectableLLMs = useTypedRedux("customize", "selectable_llms");

  function makeLLMOption(btnModel: LanguageModel, title: string) {
    if (!selectableLLMs.includes(btnModel as any)) return;
    if (typeof btnModel !== "string") return;

    const model = (
      <>
        <strong>{modelToName(btnModel)}</strong>{" "}
        <LLMModelPrice model={btnModel} />
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
    return {
      value: btnModel,
      display,
      label: <Tooltip title={tooltip}>{display}</Tooltip>,
    };
  }

  function makeLLMGroup(
    ret: NonNullable<SelectProps["options"]>,
    service: LLMServiceName,
    options,
  ) {
    // there could be "undefined" in the list of options
    options = options?.filter((o) => !!o) as SelectProps["options"];
    if (options?.length === 0) return;
    const info = LLM_PROVIDER[service];
    const label = (
      <>
        <Text strong>{info.name}</Text> – {info.short}
      </>
    );
    const title = info.desc;
    ret.push({ label, title, options });
  }

  function appendOpenAI(ret: NonNullable<SelectProps["options"]>): void {
    if (!showOpenAI) return;
    makeLLMGroup(
      ret,
      "openai",
      MODELS_OPENAI.map((m) => makeLLMOption(m, LLM_DESCR[m])),
    );
  }

  function appendGoogle(ret: NonNullable<SelectProps["options"]>): void {
    if (!showGoogle) return;
    makeLLMGroup(
      ret,
      "google",
      GOOGLE_MODELS.map((m) => makeLLMOption(m, LLM_DESCR[m])),
    );
  }

  function appendMistral(ret: NonNullable<SelectProps["options"]>): void {
    if (!showMistral) return;
    makeLLMGroup(
      ret,
      "mistralai",
      MISTRAL_MODELS.map((m) => makeLLMOption(m, LLM_DESCR[m])),
    );
  }

  function appendAnthropic(ret: NonNullable<SelectProps["options"]>): void {
    if (!showAnthropic) return;
    makeLLMGroup(
      ret,
      "anthropic",
      ANTHROPIC_MODELS.map((m) => makeLLMOption(m, LLM_DESCR[m])),
    );
  }

  function appendOllama(ret: NonNullable<SelectProps["options"]>): void {
    if (!showOllama || !ollama) return;

    const options: NonNullable<SelectProps["options"]> = [];
    for (const [key, config] of Object.entries<OllamaPublic>(ollama.toJS())) {
      const { display, desc } = config;
      const ollamaModel = toOllamaModel(key);
      const text = (
        <>
          <strong>{display}</strong> <LLMModelPrice model={ollamaModel} /> –{" "}
          {desc ?? "Ollama"}
        </>
      );
      options.push({
        value: ollamaModel,
        display: (
          <>
            <LanguageModelVendorAvatar model={ollamaModel} />{" "}
            <strong>{modelToName(ollamaModel)}</strong>{" "}
            <LLMModelPrice model={ollamaModel} />
          </>
        ),
        label: (
          <Tooltip title={text}>
            <LanguageModelVendorAvatar model={ollamaModel} /> {text}
          </Tooltip>
        ),
      });
    }
    makeLLMGroup(ret, "ollama", options);
  }

  function getOptions(): SelectProps["options"] {
    const ret: NonNullable<SelectProps["options"]> = [];
    appendOpenAI(ret);
    appendGoogle(ret);
    appendMistral(ret);
    appendAnthropic(ret);
    appendOllama(ret);
    return ret;
  }

  // all models selectable here must be in selectableLLMs(default: USER_SELECTABLE_LANGUAGE_MODELS) + the custom ones from the ollama configuration
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

export function LLMModelPrice({
  model,
  floatRight = false,
}: {
  model: string;
  floatRight?: boolean;
}) {
  const is_cocalc_com = useTypedRedux("customize", "is_cocalc_com");

  // on non-cocalc.com pages, all models are free, hence we do not need to show the price
  if (!is_cocalc_com) return null;

  const props: { style?: CSS } = {};
  if (floatRight) {
    props.style = { float: "right", marginLeft: "20px" };
  }

  return isFreeModel(model, is_cocalc_com) ? (
    <Tag color="success" {...props}>
      free
    </Tag>
  ) : (
    <Tag color="error" {...props}>
      paid
    </Tag>
  );
}
