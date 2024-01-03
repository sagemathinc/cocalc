import { Radio, Tooltip } from "antd";

import { CSS, redux } from "@cocalc/frontend/app-framework";
import {
  DEFAULT_MODEL,
  LLM_USERNAMES,
  LanguageModel,
  USER_SELECTABLE_LANGUAGE_MODELS,
  isFreeModel,
  model2service,
} from "@cocalc/util/db-schema/openai";

export { DEFAULT_MODEL };
export type { LanguageModel };

interface Props {
  model: LanguageModel;
  setModel: (model: LanguageModel) => void;
  size?;
  style?: CSS;
  project_id: string;
}

// The tooltips below are adopted from chat.openai.com

const GOOGLE_GEMINI: LanguageModel = "gemini-pro";

export default function ModelSwitch({
  style,
  model,
  setModel,
  size,
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

  function renderLLMButton(btnModel: LanguageModel, title: string) {
    if (!USER_SELECTABLE_LANGUAGE_MODELS.includes(btnModel)) return;
    const prefix = isFreeModel(btnModel) ? "FREE" : "NOT FREE";
    return (
      <Tooltip title={`${prefix}: ${title}`}>
        <Radio.Button value={btnModel}>
          {modelToName(btnModel)}
          {btnModel === model
            ? !isFreeModel(btnModel)
              ? " (not free)"
              : " (free)"
            : undefined}
        </Radio.Button>
      </Tooltip>
    );
  }

  function renderOpenAI() {
    if (!showOpenAI) return null;
    return (
      <>
        {renderLLMButton(
          "gpt-3.5-turbo",
          "OpenAI's fastest model, great for most everyday tasks (4k token context)",
        )}
        {renderLLMButton(
          "gpt-3.5-turbo-16k",
          `Same as ${modelToName(
            "gpt-3.5-turbo",
          )} but with much larger context size (16k token context)`,
        )}
        {renderLLMButton(
          "gpt-4",
          "OpenAI's most capable model, great for tasks that require creativity and advanced reasoning (8k token context)",
        )}
      </>
    );
  }

  function renderGoogle() {
    if (!showGoogle) return null;

    return (
      <>
        {renderLLMButton(
          GOOGLE_GEMINI,
          `Google's Gemini Pro Generative AI model ('${GOOGLE_GEMINI}', 30k token context)`,
        )}
      </>
    );
  }

  // all models selectable here must be in util/db-schema/openai::USER_SELECTABLE_LANGUAGE_MODELS
  return (
    <Radio.Group
      style={style}
      size={size}
      value={model}
      optionType="button"
      buttonStyle="solid"
      onChange={({ target: { value } }) => {
        setModel(value);
      }}
    >
      {renderOpenAI()}
      {renderGoogle()}
    </Radio.Group>
  );
}

export function modelToName(model: LanguageModel): string {
  return LLM_USERNAMES[model] ?? model;
}

export function modelToMention(model: LanguageModel): string {
  return `<span class="user-mention" account-id=${model2service(
    model,
  )} >@${modelToName(model)}</span>`;
}
