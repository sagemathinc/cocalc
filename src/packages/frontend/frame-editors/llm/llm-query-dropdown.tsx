import type { MenuProps } from "antd";
import { Dropdown } from "antd";

import { Text } from "@cocalc/frontend/components";
import { Icon } from "@cocalc/frontend/components/icon";
import { LanguageModelVendorAvatar } from "@cocalc/frontend/components/language-model-icon";
import { modelToName } from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { useAvailableLLMs } from "@cocalc/frontend/frame-editors/llm/use-llm-menu-options";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { LLMTools } from "@cocalc/jupyter/types";
import { LLM_PROVIDER } from "@cocalc/util/db-schema/llm-utils";

interface Props {
  llmTools?: Pick<LLMTools, "model" | "setModel">;
  task?: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function LLMQueryDropdownButton({
  onClick,
  llmTools,
  task = "Ask",
  loading = false,
  disabled = false,
}: Props) {
  const { project_id } = useProjectContext();
  const modelsByService = useAvailableLLMs(project_id);

  function renderOkText() {
    if (llmTools == null) return <></>;
    return (
      <>
        <Icon name={"paper-plane"} /> {task} {modelToName(llmTools.model)}
      </>
    );
  }

  function getItems(): MenuProps["items"] {
    const ret: MenuProps["items"] = [];
    let first = true;
    for (const [service, entry] of Object.entries(modelsByService)) {
      const { models } = entry;
      if (models.length === 0) continue;

      if (!first) ret.push({ type: "divider" });
      first = false;

      const { name, short } =
        service === "custom"
          ? { name: entry.name, short: entry.desc }
          : LLM_PROVIDER[service];
      ret.push({
        type: "group",
        label: (
          <>
            <Text strong>{name}</Text>
            <Text type="secondary"> - {short}</Text>
          </>
        ),
      });

      for (const model of models) {
        const { name, title, desc, price } = model;
        ret.push({
          key: name,
          onClick: () => llmTools?.setModel(name),
          icon: (
            <LanguageModelVendorAvatar
              model={name}
              size={18}
              style={{ top: "-5px" }}
            />
          ),
          label: (
            <>
              <Text strong>{title}</Text> {price}
              <Text type="secondary"> - {desc}</Text>
            </>
          ),
        });
      }
    }
    return ret;
  }

  return (
    <Dropdown.Button
      type="primary"
      trigger={["click"]}
      icon={<Icon name="caret-down" />}
      onClick={onClick}
      menu={{
        items: getItems(),
        style: { maxHeight: "50vh", overflow: "auto" },
      }}
      loading={loading}
      disabled={disabled}
    >
      {renderOkText()}
    </Dropdown.Button>
  );
}
