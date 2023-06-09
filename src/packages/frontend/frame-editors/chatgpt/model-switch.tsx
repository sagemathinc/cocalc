import { Radio, Tooltip } from "antd";
import { OPENAI_USERNAMES, Model } from "@cocalc/util/db-schema/openai";
export type { Model };

export const DEFAULT_MODEL = "gpt-3.5-turbo";

interface Props {
  model: Model;
  setModel: (model: Model) => void;
  size?;
  style?;
}

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
        title={`${modelToName(
          "gpt-3.5-turbo"
        )} is faster, but not as smart`}
      >
        <Radio.Button value="gpt-3.5-turbo">
          {modelToName("gpt-3.5-turbo")}
        </Radio.Button>
      </Tooltip>
      <Tooltip
        title={`${modelToName(
          "gpt-4"
        )} is more intelligent with bigger context, but costs more`}
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
