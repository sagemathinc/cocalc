import { Radio, Tooltip } from "antd";

import { CSS } from "@cocalc/frontend/app-framework";
import {
  DEFAULT_MODEL,
  LLM_USERNAMES,
  LanguageModel,
  model2service,
} from "@cocalc/util/db-schema/openai";

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
      <Tooltip
        title={`Google's PaLM 2 Generative AI model ('${GOOGLE_GENAI}', 8k token context)`}
      >
        <Radio.Button value={GOOGLE_GENAI}>
          {modelToName(GOOGLE_GENAI)}
        </Radio.Button>
      </Tooltip>
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
