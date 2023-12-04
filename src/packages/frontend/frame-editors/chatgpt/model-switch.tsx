import { Radio, Tooltip } from "antd";

import { LLM_USERNAMES, Model } from "@cocalc/util/db-schema/openai";
import { DEFAULT_MODEL } from "@cocalc/util/db-schema/openai";

export type { Model };
export { DEFAULT_MODEL };

interface Props {
  model: Model;
  setModel: (model: Model) => void;
  size?;
  style?;
}

// The tooltips below are adopted from chat.openai.com

const GOOGLE_GENAI: Model = "chat-bison-001";

export default function ModelSwitch({ style, model, setModel, size }: Props) {
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

export function modelToName(model: Model): string {
  return LLM_USERNAMES[model] ?? model;
}

export function modelToMention(model: Model): string {
  return `<span class="user-mention" account-id=openai-${model} >@${modelToName(
    model,
  )}</span>`;
}
