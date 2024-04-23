/*
Use ChatGPT to explain what the code in a cell does.
*/

import { Alert, Button, Dropdown, Popconfirm, Space, Tooltip } from "antd";
import { CSSProperties, useState } from "react";

import { CSS } from "@cocalc/frontend/app-framework";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import { Text } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import LLMSelector, {
  LanguageModel,
  modelToMention,
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { LLMTools } from "@cocalc/jupyter/types";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import type { JupyterActions } from "../browser-actions";
import { CODE_BAR_BTN_STYLE } from "../consts";
import { RawPrompt } from "./raw-prompt";

interface Props {
  actions?;
  id: string;
  style?: CSSProperties;
  llmTools?: LLMTools;
  is_current?: boolean;
}

const MODES = ["explain", "bugfix", "improve", "translate"] as const;
type Mode = (typeof MODES)[number];

interface LLMTool {
  icon: string;
  descr: string;
  prompt: string;
}

const ACTIONS: { [mode in Mode]: LLMTool } = {
  explain: {
    icon: "sound-outlined",
    descr:
      "Ask a large langauge model to gain some insight into the code in that cell.",
    prompt: "...",
  },
  bugfix: {
    icon: "clean-outlined",
    descr:
      "Describe the problem of that cell to a large langauge model in order to get a bugfixed version.",
    prompt: "",
  },
  improve: {
    icon: "rise-outlined",
    descr: "Ask a large language model to improve the code in that cell.",
    prompt: "",
  },
  translate: {
    icon: "translation-outlined",
    descr: "Translate the code in that cell to another language using AI.",
    prompt: "",
  },
} as const;

export function LLMCellTool({
  actions,
  id,
  style,
  llmTools,
  is_current,
}: Props) {
  const { project_id, path } = useFrameContext();
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  if (actions == null || llmTools == null) {
    return null;
  }
  const { model, setModel } = llmTools;

  const [mode, setMode] = useState<Mode | null>(null);

  function renderDropdown() {
    const style: CSS = {
      ...CODE_BAR_BTN_STYLE,
      ...(is_current
        ? { color: COLORS.AI_ASSISTANT_FONT, fontWeight: "bold" }
        : {}),
    } as const;

    return (
      <Dropdown
        trigger={["click"]}
        mouseLeaveDelay={1.5}
        menu={{
          items: Object.entries(ACTIONS).map(([mode, action]) => {
            return {
              key: mode,
              label: (
                <Tooltip title={action.descr} placement={"left"}>
                  <Icon name={action.icon} /> {capitalize(mode)}
                </Tooltip>
              ),
              onClick: () => setMode(mode as Mode),
            };
          }),
        }}
      >
        <Tooltip title="Use AI assistance on this cell">
          <Button
            disabled={isQuerying}
            type="text"
            size="small"
            style={style}
            icon={
              <AIAvatar
                size={14}
                style={{ position: "relative", top: "-3px" }}
                iconColor={is_current ? COLORS.AI_ASSISTANT_FONT : undefined}
              />
            }
          >
            <Space size="small">
              Tools
              <Icon name="angle-down" />
            </Space>
          </Button>
        </Tooltip>
      </Dropdown>
    );
  }

  function getDescription() {
    const message = createMessage({
      id,
      actions,
      model,
      open: true,
      full: false,
    });
    return (
      <div
        style={{
          width: "550px",
          overflow: "auto",
          maxWidth: "90vw",
          maxHeight: "300px",
        }}
      >
        The following will be sent to {modelToName(model)}:
        <RawPrompt input={message} />
      </div>
    );
  }

  async function onConfirm() {
    setIsQuerying(true);
    try {
      await getExplanation({ id, actions, project_id, path, model });
    } catch (err) {
      setError(`${err}`);
    } finally {
      setIsQuerying(false);
    }
  }

  async function onCancel() {
    setMode(null);
    setError("");
    setIsQuerying(false);
  }

  function renderTitle() {
    if (!mode) {
      // should actually never happen
      return <Text strong>Select a tool to use on this cell...</Text>;
    }
    return (
      <Text strong>
        {capitalize(mode)} this cell using{" "}
        <LLMSelector
          model={model}
          setModel={setModel}
          project_id={project_id}
        />
      </Text>
    );
  }

  function renderOkText() {
    return (
      <>
        <Icon name={"paper-plane"} /> Ask {modelToName(model)} (enter)
      </>
    );
  }

  function handleKeyDown(e) {
    switch (e.key) {
      case "Return":
        onConfirm();
        break;
      case "Escape":
        onCancel();
        break;
    }
  }

  return (
    <div style={style}>
      <Popconfirm
        open={mode != null}
        icon={<AIAvatar size={20} />}
        title={renderTitle()}
        description={getDescription()}
        onConfirm={onConfirm}
        onCancel={onCancel}
        okText={renderOkText()}
      >
        <a href="#" onKeyDown={handleKeyDown} tabIndex={0}>
          {renderDropdown()}
        </a>
      </Popconfirm>
      {error ? (
        <Alert
          style={{ maxWidth: "600px", margin: "15px 0" }}
          type="error"
          showIcon
          closable
          message={error}
          onClick={() => setError("")}
        />
      ) : undefined}
    </div>
  );
}

async function getExplanation({
  id,
  actions,
  project_id,
  path,
  model,
}: {
  id: string;
  actions: JupyterActions;
  project_id: string;
  path: string;
  model: LanguageModel;
}) {
  const message = createMessage({ id, actions, model, open: false });
  if (!message) {
    console.warn("getHelp -- no cell with id", id);
    return;
  }
  // scroll to bottom *after* the message gets sent.
  const chatActions = await getChatActions(actions.redux, project_id, path);
  setTimeout(() => chatActions.scrollToBottom(), 100);
  chatActions.send_chat({
    input: message,
    tag: "jupyter-explain",
    noNotification: true,
  });
}

function createMessage({ id, actions, model, open, full = true }): string {
  const cell = actions.store.get("cells").get(id);
  if (!cell) {
    return "";
  }
  const kernel_info = actions.store.get("kernel_info");
  const language = kernel_info.get("language");
  const message = createMessageText({
    language,
    cell,
    open,
    kernel_info,
    full,
  });
  const mention = modelToMention(model);
  return full ? `${mention} ${message}` : message;
}

function createMessageText({
  language,
  cell,
  open,
  kernel_info,
  full,
}): string {
  const message: string[] = [];
  message.push(
    `Explain the following ${kernel_info.get(
      "display_name",
    )} code that is in a Jupyter notebook:`,
  );

  if (full) message.push(`<details${open ? " open" : ""}>`);
  message.push(`\`\`\`${language}\n${cell.get("input")}\n\`\`\``);
  if (full) message.push(`</details>`);

  return message.join("\n\n");
}
