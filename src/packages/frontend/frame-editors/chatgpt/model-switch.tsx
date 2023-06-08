import { Radio } from "antd";
import { OPENAI_USERNAMES, Model } from "@cocalc/util/db-schema/openai";
export type { Model };

interface Props {
  model: Model;
  setModel: (model: Model) => void;
  size?;
}

export default function ModelSwitch({ model, setModel, size }: Props) {
  return (
    <Radio.Group
      size={size}
      value={model}
      optionType="button"
      buttonStyle="solid"
      onChange={({ target: { value } }) => {
        setModel(value);
      }}
    >
      <Radio.Button value="gpt-3.5-turbo">
        {OPENAI_USERNAMES["gpt-3.5-turbo"]}
      </Radio.Button>
      <Radio.Button value="gpt-4">{OPENAI_USERNAMES["chatgpt4"]}</Radio.Button>
    </Radio.Group>
  );
}

export function modelToName(model: Model): string {
  return OPENAI_USERNAMES[model] ?? model;
}

export function modelToMention(model: Model): string {
  return `<span class="user-mention" account-id=${
    model == "gpt-4" ? "chatgpt4" : "chatgpt"
  }>@${modelToName(model)}</span>`;
}
