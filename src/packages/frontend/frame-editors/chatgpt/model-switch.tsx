import { Radio, Tooltip } from "antd";

import { CSS, redux } from "@cocalc/frontend/app-framework";
import {
  DEFAULT_MODEL,
  LLM_USERNAMES,
  LanguageModel,
  model2service,
} from "@cocalc/util/db-schema/openai";
import { useProjectContext } from "../../project/context";

export { DEFAULT_MODEL };
export type { LanguageModel };

interface Props {
  model: LanguageModel;
  setModel: (model: LanguageModel) => void;
  size?;
  style?: CSS;
}

// The tooltips below are adopted from chat.openai.com

const GOOGLE_GENAI: LanguageModel = "chat-bison-001";

export default function ModelSwitch({ style, model, setModel, size }: Props) {
  const { project_id } = useProjectContext();
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

  function renderOpenAI() {
    if (!showOpenAI) return null;
    return (
      <>
        <Tooltip
          title={
            "FREE: OpenAI's fastest model, great for most everyday tasks (4k token context)"
          }
        >
          <Radio.Button value="gpt-3.5-turbo">
            {modelToName("gpt-3.5-turbo")}
          </Radio.Button>
        </Tooltip>
        <Tooltip
          title={`NOT FREE: Same as ${modelToName(
            "gpt-3.5-turbo",
          )} but with much larger context size (16k token context)`}
        >
          <Radio.Button value="gpt-3.5-turbo-16k">
            {modelToName("gpt-3.5-turbo-16k")}
          </Radio.Button>
        </Tooltip>{" "}
        <Tooltip
          title={
            "NOT FREE: OpenAI's most capable model, great for tasks that require creativity and advanced reasoning (8k token context)"
          }
        >
          <Radio.Button value="gpt-4">
            {modelToName("gpt-4")}
            {model === "gpt-4" ? " (not free)" : ""}
          </Radio.Button>
        </Tooltip>
      </>
    );
  }

  function renderGoogle() {
    if (!showGoogle) return null;
    return (
      <Tooltip
        title={`Google's PaLM 2 Generative AI model ('${GOOGLE_GENAI}', 8k token context)`}
      >
        <Radio.Button value={GOOGLE_GENAI}>
          {modelToName(GOOGLE_GENAI)}
        </Radio.Button>
      </Tooltip>
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
