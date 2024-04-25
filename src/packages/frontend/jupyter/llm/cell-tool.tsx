/*
Use ChatGPT to explain what the code in a cell does.
*/

import {
  Alert,
  Button,
  Collapse,
  Dropdown,
  Flex,
  Input,
  Popconfirm,
  Space,
  Switch,
  Tooltip,
} from "antd";
import { CSSProperties, useEffect, useState } from "react";

import { CSS, useAsyncEffect } from "@cocalc/frontend/app-framework";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import { Text } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import LLMSelector, {
  modelToMention,
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { LLMTools } from "@cocalc/jupyter/types";
import { LanguageModel } from "@cocalc/util/db-schema/llm-utils";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { LLMModelName } from "../../components/llm-name";
import type { JupyterActions } from "../browser-actions";
import { CODE_BAR_BTN_STYLE } from "../consts";
import { cellOutputToText } from "../output-messages/ansi";
import { RawPrompt } from "./raw-prompt";

interface Props {
  actions?;
  id: string;
  style?: CSSProperties;
  llmTools?: LLMTools;
  is_current?: boolean;
}

const TARGET_LANGS = [
  "Python",
  "R",
  "SageMath",
  "Octave",
  "Matlab",
  "JavaScript",
  "C++",
] as const;
type TargetLanguage = (typeof TARGET_LANGS)[number];

const MODES = ["explain", "bugfix", "improve", "translate"] as const;
type Mode = (typeof MODES)[number];

type PromptGen = ({
  language,
  kernel_display,
  targetLangauge,
  bug,
}: {
  language: string;
  kernel_display: string;
  bug?: string;
  targetLangauge?: TargetLanguage;
}) => string;

interface LLMTool {
  icon: string;
  descr: string;
  prompt: PromptGen;
}

const ACTIONS: { [mode in Mode]: LLMTool } = {
  explain: {
    icon: "sound-outlined",
    descr:
      "Ask a large langauge model to gain some insight into the code in that cell.",
    prompt: ({ kernel_display }) =>
      `Explain the following ${kernel_display} code in a Jupyter Notebook cell:`,
  },
  bugfix: {
    icon: "clean-outlined",
    descr:
      "Describe the problem of that cell to a large langauge model in order to get a bugfixed version.",
    prompt: ({ kernel_display, bug }) =>
      `Bugfix the follwing ${kernel_display} code in a Jupyter Notebook cell.${
        bug ? ` The problem is: "${bug}".` : ""
      }`,
  },
  improve: {
    icon: "rise-outlined",
    descr: "Ask a large language model to improve the code in that cell.",
    prompt: ({ language }) =>
      `Review and improve the following ${language} code in a Jupyter Notebook cell:`,
  },
  translate: {
    icon: "translation-outlined",
    descr: "Translate the code in that cell to another language using AI.",
    prompt: ({ language, targetLangauge = "R" }) =>
      `Translate the following ${language} code to ${targetLangauge}.`,
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
  const [mode, setMode] = useState<Mode | null>(null);
  const [bug, setBug] = useState<string>("");
  const [targetLangauge, setTargetLanguage] =
    useState<TargetLanguage>("Python");
  const [includeOutput, setIncludeOutput] = useState<boolean>(false);
  const [description, setDescription] = useState<JSX.Element | null>(null);

  useEffect(() => {
    if (mode == null || actions == null) return;
    // we change the target language to R, if the cell language is python – otherwise target is python
    const kernel_info = actions.store.get("kernel_info");
    const language = kernel_info.get("language");
    if (language === "Python" && targetLangauge === "Python") {
      setTargetLanguage("R");
    }
  }, [mode, actions]);

  useAsyncEffect(async () => {
    if (mode == null || llmTools == null) {
      setDescription(null);
      return;
    }
    const { model } = llmTools;
    const { message, tokens } = await createMessage({
      id,
      actions,
      model,
      includeOutput,
      open: true,
      preview: true,
      mode,
      bug,
      targetLangauge,
    });
    setDescription(
      <Space
        direction="vertical"
        style={{
          width: "550px",
          overflow: "auto",
          maxWidth: "90vw",
          maxHeight: "90vh",
          paddingRight: "20px",
        }}
      >
        {renderControls()}
        {renderIncludeOutput()}
        <Collapse
          items={[
            {
              key: "1",
              label: <>This will be sent to {modelToName(model)}</>,
              children: <RawPrompt input={message} />,
            },
          ]}
        />
        <LLMCostEstimation model={model} tokens={tokens} />
      </Space>,
    );
  }, [mode, id, actions, llmTools?.model, includeOutput, bug, targetLangauge]);

  if (actions == null || llmTools == null) {
    return null;
  }

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

  function renderControls() {
    switch (mode) {
      case "bugfix":
        return (
          <div>
            <Text>Describe the problem or bug:</Text>
            <Input
              value={bug}
              onChange={(e) => setBug(e.target.value)}
              placeholder={"Describe the problem…"}
            />
          </div>
        );
    }
    return null;
  }

  function renderIncludeOutput() {
    if (llmTools == null) return;
    return (
      <Flex align="center" gap="10px">
        <Flex flex={0}>
          <Switch
            onChange={(val) => setIncludeOutput(val)}
            unCheckedChildren={"No output"}
            checkedChildren={"Include output"}
          />
        </Flex>
        <Flex flex={1}>
          <Text type="secondary">
            Including output helps <LLMModelName model={llmTools.model} /> to
            better understand the code!
          </Text>
        </Flex>
      </Flex>
    );
  }

  async function onConfirm() {
    if (mode == null || llmTools == null) return;
    const { model } = llmTools;
    setIsQuerying(true);
    try {
      await getExplanation({
        id,
        actions,
        project_id,
        path,
        model,
        includeOutput,
        mode,
        bug,
        targetLangauge,
      });
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
    if (llmTools == null) return;
    return (
      <Text strong>
        {capitalize(mode)} this cell using{" "}
        <LLMSelector
          model={llmTools.model}
          setModel={llmTools.setModel}
          project_id={project_id}
        />
      </Text>
    );
  }

  function renderOkText() {
    if (llmTools == null) return <></>;
    return (
      <>
        <Icon name={"paper-plane"} /> Ask {modelToName(llmTools.model)}
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
        description={description}
        onConfirm={onConfirm}
        onCancel={onCancel}
        okText={renderOkText()}
      >
        {/* TODO: this wrapper idea comes from PopconfirmKeyboard but it seemingly does not work with a dropdown */}
        <a href="#" onKeyDown={handleKeyDown} tabIndex={0}>
          {renderDropdown()}
        </a>
      </Popconfirm>
      {error ? (
        <Alert
          style={{ maxWidth: "600px", fontSize: "10px", margin: "0" }}
          type="error"
          banner
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
  mode,
  actions,
  includeOutput,
  project_id,
  path,
  model,
  bug,
  targetLangauge,
}: {
  id: string;
  mode: Mode;
  includeOutput: boolean;
  actions: JupyterActions;
  project_id: string;
  path: string;
  model: LanguageModel;
  bug: string;
  targetLangauge: TargetLanguage;
}) {
  const { message } = await createMessage({
    id,
    actions,
    model,
    mode,
    includeOutput,
    bug,
    targetLangauge,
  });
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

async function createMessage({
  id,
  actions,
  model,
  includeOutput,
  open = false,
  mode,
  preview = false,
  bug,
  targetLangauge,
}: {
  id: string;
  mode: Mode;
  actions: JupyterActions;
  includeOutput: boolean;
  open?: boolean; // expand <details></details>
  preview?: boolean; // preview raw text does not include the details tags (only what's inside of it)
  model: LanguageModel;
  bug: string;
  targetLangauge: TargetLanguage;
}): Promise<{ message: string; tokens: number }> {
  const cell = actions.store.get("cells").get(id);
  if (!cell) return { message: "", tokens: 0 };

  const kernel_info = actions.store.get("kernel_info");
  const language = kernel_info.get("language");

  const kernel_display = kernel_info.get("display_name");
  const prompt = ACTIONS[mode].prompt({
    language,
    kernel_display,
    bug,
    targetLangauge,
  });
  const { message, tokens } = await createMessageText({
    model,
    language,
    cell,
    includeOutput,
    open,
    kernel_info,
    preview,
    mode,
    prompt,
  });
  const mention = modelToMention(model);
  return { message: preview ? message : `${mention} ${message}`, tokens };
}

async function createMessageText({
  model,
  language,
  cell,
  includeOutput,
  open,
  preview,
  prompt,
}: {
  model: LanguageModel;
  language: string;
  preview: boolean;
  mode: Mode;
  includeOutput: boolean;
  open: boolean;
  cell: any;
  prompt: string;
  kernel_info: any;
}): Promise<{ message: string; tokens: number }> {
  // do not import until needed -- it is HUGE!
  const { truncateMessage, getMaxTokens, numTokensUpperBound } = await import(
    "@cocalc/frontend/misc/llm"
  );

  const chunks: string[] = [];

  chunks.push(prompt);

  if (!preview) chunks.push(`<details${open ? " open" : ""}>`);
  chunks.push(`\`\`\`${language}\n${cell.get("input")}\n\`\`\``);
  if (includeOutput) {
    chunks.push("Output:");
    const fullOutput = cellOutputToText(cell);

    // The output could be huge – we truncate to half of what we can send
    const maxTokens = getMaxTokens(model) / 2;
    const output = truncateMessage(fullOutput, maxTokens);

    chunks.push(`\`\`\`text\n${output}\n\`\`\``);
  }
  if (!preview) chunks.push(`</details>`);

  const message = chunks.join("\n\n");
  return { message, tokens: numTokensUpperBound(message, getMaxTokens(model)) };
}
