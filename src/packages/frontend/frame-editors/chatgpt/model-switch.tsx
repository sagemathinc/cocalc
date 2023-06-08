import { Radio, Tooltip } from "antd";
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
      <Tooltip
        title={`${modelToName(
          "gpt-3.5-turbo"
        )} is free and fast, but not as intelligent`}
      >
        <Radio.Button value="gpt-3.5-turbo">
          {modelToName("gpt-3.5-turbo")}
        </Radio.Button>
      </Tooltip>
      <Tooltip
        title={`${modelToName("gpt-4")} is more intelligent, but not free`}
      >
        <Radio.Button value="gpt-4">{modelToName("gpt-4")}</Radio.Button>
      </Tooltip>
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
