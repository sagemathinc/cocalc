/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { SelectProps } from "antd";
import { Select, Space, Tag, Tooltip } from "antd";
import type { ConfigProviderProps } from "antd/lib/config-provider";
import { isEmpty } from "lodash";

import { CSS, redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { HelpIcon, Paragraph, Text } from "@cocalc/frontend/components";
import { LanguageModelVendorAvatar } from "@cocalc/frontend/components/language-model-icon";
import {
  getUserDefinedLLMByModel,
  useUserDefinedLLM,
} from "@cocalc/frontend/frame-editors/llm/use-userdefined-llm";
import {
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
  LANGUAGE_MODEL_SERVICES,
  LLMServiceName,
  LLMServicesAvailable,
  LLM_DESCR,
  LLM_PROVIDER,
  LLM_USERNAMES,
  LanguageModel,
  MISTRAL_MODELS,
  MODELS_OPENAI,
  XAI_MODELS,
  fromCustomOpenAIModel,
  fromOllamaModel,
  getLLMCost,
  getLLMPriceRange,
  isCoreLanguageModel,
  isCustomOpenAI,
  isFreeModel,
  isLLMServiceName,
  isOllamaLLM,
  isUserDefinedModel,
  model2service,
  toCustomOpenAIModel,
  toOllamaModel,
  toUserLLMModelName,
} from "@cocalc/util/db-schema/llm-utils";
import { round2up } from "@cocalc/util/misc";
import type { CustomLLMPublic } from "@cocalc/util/types/llm";
import { FormattedMessage } from "react-intl";
import { getCustomLLMGroup } from "./components";

type SizeType = ConfigProviderProps["componentSize"];

const OPTION_TITLE_STYLE: CSS = {
  maxWidth: "300px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  display: "inline-block",
  verticalAlign: "bottom",
} as const;

interface Props {
  model: LanguageModel;
  setModel: (model: LanguageModel) => void;
  size?: SizeType;
  style?: CSS;
  project_id?: string;
}

// ATTN: if you change this LLMSelector, you also have to change useLLMMenuOptions
export default function LLMSelector({
  style,
  model,
  setModel,
  size = "middle",
  project_id,
}: Props) {
  const is_cocalc_com = useTypedRedux("customize", "is_cocalc_com");
  const llm_markup = useTypedRedux("customize", "llm_markup");
  const user_llm = useUserDefinedLLM();

  // ATTN: you cannot use useProjectContext because this component is used outside a project context
  // when it is opened via an error in the gutter of a latex document. (I don't know why, maybe fixable)
  const projectsStore = redux.getStore("projects");

  const show = LANGUAGE_MODEL_SERVICES.reduce((cur, svc) => {
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
        <strong>{model}</strong>: {title}
      </>
    );
    const display = (
      <>
        <LanguageModelVendorAvatar model={btnModel} /> <strong>{model}</strong>{" "}
        – <span style={OPTION_TITLE_STYLE}>{title}</span>
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
    service: LLMServiceName | "custom" | "user",
    options,
  ) {
    // there could be "undefined" in the list of options
    options = options?.filter((o) => !!o) as SelectProps["options"];
    if (options?.length === 0) return;

    if (service === "custom") {
      const { title, label } = getCustomLLMGroup();
      ret.push({
        label: (
          <>
            {label} – {title}
          </>
        ),
        title: "These language models are configured by the administrators.",
        options,
      });
    } else if (service === "user") {
      ret.push({
        label: (
          <>
            <Text strong>User Defined LLM</Text> – Configured in Account →
            Language Model
          </>
        ),
        title:
          "These language models are configured by you in Account Settings → Language Model.",
        options,
      });
    } else {
      const { name, desc, short } = LLM_PROVIDER[service];
      const label = (
        <>
          <Text strong>{name}</Text> – {short}
        </>
      );
      ret.push({ label, title: desc, options });
    }
  }

  function appendOpenAI(ret: NonNullable<SelectProps["options"]>): void {
    if (!show.openai) return;
    makeLLMGroup(
      ret,
      "openai",
      MODELS_OPENAI.map((m) => makeLLMOption(m, LLM_DESCR[m])),
    );
  }

  function appendGoogle(ret: NonNullable<SelectProps["options"]>): void {
    if (!show.google) return;
    makeLLMGroup(
      ret,
      "google",
      GOOGLE_MODELS.map((m) => makeLLMOption(m, LLM_DESCR[m])),
    );
  }

  function appendMistral(ret: NonNullable<SelectProps["options"]>): void {
    if (!show.mistralai) return;
    makeLLMGroup(
      ret,
      "mistralai",
      MISTRAL_MODELS.map((m) => makeLLMOption(m, LLM_DESCR[m])),
    );
  }

  function appendAnthropic(ret: NonNullable<SelectProps["options"]>): void {
    if (!show.anthropic) return;
    makeLLMGroup(
      ret,
      "anthropic",
      ANTHROPIC_MODELS.map((m) => makeLLMOption(m, LLM_DESCR[m])),
    );
  }

  function appendXai(ret: NonNullable<SelectProps["options"]>): void {
    if (!show.xai) return;
    makeLLMGroup(
      ret,
      "xai",
      XAI_MODELS.map((m) => makeLLMOption(m, LLM_DESCR[m])),
    );
  }

  function appendOllama(options: NonNullable<SelectProps["options"]>): void {
    if (!show.ollama || !ollama) return;

    for (const [key, config] of Object.entries<CustomLLMPublic>(
      ollama.toJS(),
    )) {
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
  }

  function appendCustomOpenAI(
    options: NonNullable<SelectProps["options"]>,
  ): void {
    if (!show.custom_openai || !custom_openai) return;

    for (const [key, config] of Object.entries<CustomLLMPublic>(
      custom_openai.toJS(),
    )) {
      const { display, desc } = config;
      const customOpenAIModel = toCustomOpenAIModel(key);
      const text = (
        <>
          <strong>{display}</strong> <LLMModelPrice model={customOpenAIModel} />{" "}
          – {desc ?? "OpenAI (custom)"}
        </>
      );
      options.push({
        value: customOpenAIModel,
        display: (
          <>
            <LanguageModelVendorAvatar model={customOpenAIModel} />{" "}
            <strong>{modelToName(customOpenAIModel)}</strong>{" "}
            <LLMModelPrice model={customOpenAIModel} />
          </>
        ),
        label: (
          <Tooltip title={text}>
            <LanguageModelVendorAvatar model={customOpenAIModel} /> {text}
          </Tooltip>
        ),
      });
    }
  }

  function appendUserDefined(ret: NonNullable<SelectProps["options"]>): void {
    if (isEmpty(user_llm)) return;
    const user: NonNullable<SelectProps["options"]> = [];
    const text = LLM_PROVIDER.user.desc;
    for (const llm of user_llm) {
      const { display, model, service } = llm;
      if (!isLLMServiceName(service)) continue;
      const um = toUserLLMModelName(llm);
      const entry = (
        <>
          <LanguageModelVendorAvatar model={um} />{" "}
          <strong>{display || model}</strong> – {LLM_PROVIDER[service].name}
        </>
      );
      user.push({
        value: um,
        display: entry,
        label: <Tooltip title={text}>{entry}</Tooltip>,
      });
    }
    makeLLMGroup(ret, "user", user);
  }

  function getOptions(): SelectProps["options"] {
    const ret: NonNullable<SelectProps["options"]> = [];
    appendOpenAI(ret);
    appendGoogle(ret);
    appendMistral(ret);
    appendAnthropic(ret);
    appendXai(ret);
    const custom: NonNullable<SelectProps["options"]> = [];
    appendOllama(custom);
    appendCustomOpenAI(custom);
    if (custom.length > 0) {
      makeLLMGroup(ret, "custom", custom);
    }
    appendUserDefined(ret);
    return ret;
  }

  function renderHelpPricing() {
    if (!is_cocalc_com) return;

    const [input, output] = [500, 300];
    const { min, max } = getLLMPriceRange(input, output, llm_markup);

    function calcSelected() {
      if (isFreeModel(model, is_cocalc_com) || !isCoreLanguageModel(model)) {
        return "free";
      } else {
        const { prompt_tokens: model_input, completion_tokens: model_output } =
          getLLMCost(model, llm_markup);
        return `about $${round2up(
          input * model_input + output * model_output,
        ).toFixed(2)}`;
      }
    }

    return (
      <FormattedMessage
        id="llm-selector.help.message2"
        defaultMessage={`
        <Paragraph>
          The models marked as "{FREE}" do not incur any charges.
          However, they are rate limited to avoid abuse.
          The more capable models are marked "{PREMIUM}" and charged by the number of
          read and generated tokens – i.e. "pay-as-you-go" – and do not have rate limitations.
          Usually, these charges are very small!
        </Paragraph>
        <Paragraph>
          Assuming a typical usage involves {input} input tokens and {output} output tokens,
          the price across all models ranges from \${min} to \${max} per usage,
          and is {calc} for the selected model {name}.
        </Paragraph>`}
        values={{
          Paragraph: (c) => <Paragraph>{c}</Paragraph>,
          FREE,
          PREMIUM,
          input,
          output,
          min: min.toFixed(2),
          max: max.toFixed(2),
          calc: calcSelected(),
          name: modelToName(model),
        }}
      />
    );
  }

  function renderHelp() {
    return (
      <HelpIcon title={"Language Model Selection"}>
        <>
          <Paragraph>
            <FormattedMessage
              id="llm-selector.help.message1"
              defaultMessage={`This selector determines which language model will be used to generate the response.
            You can select from a variety of models, each with its own strengths and weaknesses.
            Your choice will become the default the next time you use an LLM.`}
            />
          </Paragraph>
          {renderHelpPricing()}
        </>
      </HelpIcon>
    );
  }

  // all models selectable here must be in selectableLLMs(default: USER_SELECTABLE_LANGUAGE_MODELS) + the custom ones from the Ollama configuration
  return (
    <Space direction="horizontal" style={{ whiteSpace: "nowrap" }}>
      <Select
        styles={{ popup: { root: style } }}
        size={size}
        value={model}
        onChange={setModel}
        style={{ width: 300 }}
        optionLabelProp={"display"}
        popupMatchSelectWidth={false}
        options={getOptions()}
      />
      {renderHelp()}
    </Space>
  );
}

export function modelToName(model: LanguageModel): string {
  if (isOllamaLLM(model)) {
    const ollama = redux.getStore("customize").get("ollama")?.toJS() ?? {};
    const om = ollama[fromOllamaModel(model)];
    return om ? om.display : `Ollama ${model}`;
  }

  if (isCustomOpenAI(model)) {
    const custom_openai =
      redux.getStore("customize").get("custom_openai")?.toJS() ?? {};
    const om = custom_openai[fromCustomOpenAIModel(model)];
    return om ? om.display : `OpenAI (custom) ${model}`;
  }

  if (isUserDefinedModel(model)) {
    const data = getUserDefinedLLMByModel(model);
    return data?.display ?? model;
  }

  return LLM_USERNAMES[model] ?? model;
}

export function modelToMention(model: LanguageModel): string {
  const id = isUserDefinedModel(model) ? model : model2service(model);
  return `<span class="user-mention" account-id=${id} >@${modelToName(
    model,
  )}</span>`;
}

const FREE = "free";
const PREMIUM = "premium";

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
      {FREE}
    </Tag>
  ) : (
    <Tag color="warning" {...props}>
      {PREMIUM}
    </Tag>
  );
}
