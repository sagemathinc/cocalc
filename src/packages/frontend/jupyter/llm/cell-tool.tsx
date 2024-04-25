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
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import { CSSProperties, useEffect, useState } from "react";

import { CSS, useAsyncEffect } from "@cocalc/frontend/app-framework";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import { A, CloseX2, Paragraph, Text } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import LLMSelector, {
  modelToMention,
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import track from "@cocalc/frontend/user-tracking";
import { LLMTools } from "@cocalc/jupyter/types";
import { LanguageModel } from "@cocalc/util/db-schema/llm-utils";
import { capitalize, getRandomColor, unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
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
  "Julia",
  "Octave",
  "JavaScript",
  "C++",
  "Java",
  "Matlab",
] as const;

type TargetLanguage = (typeof TARGET_LANGS)[number];

const MODES = ["explain", "bugfix", "improve", "translate"] as const;
type Mode = (typeof MODES)[number];

type PromptGen = ({
  language,
  kernel_display,
  targetLangauge,
  extra,
  stepByStep,
}: {
  language: string;
  kernel_display: string;
  extra?: string;
  targetLangauge?: TargetLanguage;
  stepByStep?: boolean;
}) => string;

interface LLMTool {
  icon: string;
  descr: string;
  prompt: PromptGen;
}

const IMPROVEMENTS = [
  "code quality",
  "execution speed",
  "memory usage",
  "readability",
  "documentation",
  "style",
] as const;

const ACTIONS: { [mode in Mode]: LLMTool } = {
  explain: {
    icon: "sound-outlined",
    descr:
      "Ask a large langauge model to gain some insight into the code in that cell.",
    prompt: ({ language, stepByStep }) =>
      `Your task is to give a ${
        stepByStep ? `step-by-step explanation` : `high-level summary`
      } of the provided ${capitalize(
        language,
      )} code in a Jupyter Notebook cell:`,
  },
  bugfix: {
    icon: "clean-outlined",
    descr:
      "Describe the problem of that cell to a large langauge model in order to get a bugfixed version.",
    prompt: ({ language, extra }) =>
      `Your task is to analyze the provided ${capitalize(
        language,
      )} code in a Jupyter Notebook cell. Identify any bugs or errors. Explain the problems you found in the original code and how your fixes address them.${
        extra
          ? ` In particular, the problem you have to fix is: "${extra}".`
          : ""
      }`,
  },
  improve: {
    icon: "rise-outlined",
    descr: "Ask a large language model to improve the code in that cell.",
    prompt: ({ language, extra }) =>
      `Your task is to analyze the provided ${capitalize(
        language,
      )} code snippet in a Jupyter Notebook cell. Identify any areas of improvments. The new code must be functional, efficient, and adhere to best practices. Explain how your code improves it.${
        extra ? ` In particular, optimize this aspect: "${extra}"` : ""
      }`,
  },
  translate: {
    icon: "translation-outlined",
    descr: "Translate the code in that cell to another language using AI.",
    prompt: ({ language, targetLangauge = "R" }) =>
      `Your task is to translate the following ${capitalize(
        language,
      )} code to ${targetLangauge}.`,
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
  const [extra, setExtra] = useState<string>("");
  const [targetLangauge, setTargetLanguage] =
    useState<TargetLanguage>("Python");
  const [includeOutput, setIncludeOutput] = useState<boolean>(false);
  const [description, setDescription] = useState<JSX.Element | null>(null);
  const [kernelLanguage, setKernelLanguage] = useState<string>("");
  const [stepByStep, setStepByStep] = useState<boolean>(true);

  useEffect(() => {
    if (mode == null || actions == null) return;
    // we change the target language to R, if the cell language is python – otherwise target is python
    const kernel_info = actions.store.get("kernel_info");
    const language = kernel_info.get("language");
    setKernelLanguage(language);

    if (mode === "improve" && !extra.trim()) {
      setExtra(IMPROVEMENTS[0]);
    }
  }, [mode, actions]);

  useAsyncEffect(async () => {
    if (mode == null || llmTools == null) {
      setDescription(null);
      return;
    }

    const { model } = llmTools;
    const { message, tokens } = await createMessage(true);

    setDescription(
      <Space
        direction="vertical"
        style={{
          width: "600px",
          overflow: "auto",
          maxWidth: "90vw",
          maxHeight: "90vh",
        }}
      >
        {renderExplanation()}
        {renderControls()}
        {renderIncludeOutput()}
        <Collapse
          items={[
            {
              key: "1",
              label: (
                <>Click to see what will be sent to {modelToName(model)}.</>
              ),
              children: (
                <RawPrompt
                  input={message}
                  style={{ border: "none", padding: "0", margin: "0" }}
                />
              ),
            },
          ]}
        />

        <Paragraph type="secondary">
          Submitting this message to {modelToName(model)} will initiate a chat
          in the{" "}
          <A href={"https://doc.cocalc.com/chat.html#side-chat"}>
            side-chat frame
          </A>
          . There, you can reply in the new thread to continue the conversation.{" "}
          <LLMCostEstimation model={model} tokens={tokens} />
        </Paragraph>
      </Space>,
    );
  }, [
    mode,
    id,
    actions,
    llmTools?.model,
    includeOutput,
    extra,
    targetLangauge,
    stepByStep,
  ]);

  // end of hooks

  async function getExplanation(preview: boolean) {
    const { message } = await createMessage(preview);
    if (!message) {
      console.warn("getExplanation -- no cell with id", id);
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

  async function createMessage(
    preview: boolean,
  ): Promise<{ message: string; tokens: number }> {
    const empty = { message: "", tokens: 0 };

    if (mode == null || llmTools == null) return empty;
    const { model } = llmTools;
    if (mode == null) return empty;

    const cell = actions.store.get("cells").get(id);
    if (!cell) return empty;

    const { message, tokens } = await createMessageText({
      cell,
      model,
      preview,
    });
    return {
      message: preview ? message : `${modelToMention(model)} ${message}`,
      tokens,
    };
  }

  async function createMessageText({
    cell,
    model,
    preview,
  }: {
    model: LanguageModel;
    preview: boolean;
    cell: any;
  }): Promise<{ message: string; tokens: number }> {
    if (mode == null) return { message: "Error: no mode selected.", tokens: 0 };

    const kernel_info = actions.store.get("kernel_info");
    const language = kernel_info.get("language");
    const kernel_display = kernel_info.get("display_name");
    const prompt = ACTIONS[mode].prompt({
      language,
      kernel_display,
      extra,
      targetLangauge,
      stepByStep,
    });

    // do not import until needed -- it is HUGE!
    const { truncateMessage, getMaxTokens, numTokensUpperBound } = await import(
      "@cocalc/frontend/misc/llm"
    );

    const chunks: string[] = [];

    chunks.push(prompt);

    const open = !preview;

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
    return {
      message,
      tokens: numTokensUpperBound(message, getMaxTokens(model)),
    };
  }

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
              onClick: () => {
                setMode(mode as Mode);
                track("jupyter-cell-llm", { action: "selected", mode });
              },
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

  function renderExplanation() {
    if (mode == null) return null;
    switch (mode) {
      case "improve":
        return (
          <Paragraph type="secondary">
            The selected language model will analyze the code and suggest
            improvements. Optionally, please explain what should be improved!
            Beware, that the results are not guaranteed to be correct, nor could
            cause subtle problmes – review them carefully.
          </Paragraph>
        );
      case "bugfix":
        return (
          <Paragraph type="secondary">
            Explain the problem of the code in the cell and the selected
            language model will attempt to fix it. Usually, it will tell you if
            it found a problem and explain it to you.
          </Paragraph>
        );
      case "explain":
        return (
          <Paragraph type="secondary">
            The code in the cell will be sent to the selected language model. It
            will explain the code to you in plain language.
          </Paragraph>
        );
      case "translate":
        return (
          <Paragraph>
            This will attempt to translate the code in the cell to another
            programming language. The result might not work at all – but if
            you're more familiar with the selected target language, you might
            find it easier to understand what's going on!
          </Paragraph>
        );
      default:
        unreachable(mode);
        return null;
    }
  }

  function renderControls() {
    switch (mode) {
      case "bugfix":
        return (
          <Paragraph>
            <Text>Describe the problem or bug:</Text>{" "}
            <Input
              autoFocus
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder={"Describe the problem to fix…"}
            />
          </Paragraph>
        );
      case "improve":
        return (
          <>
            <Paragraph>
              <Text>What should be improved: </Text>{" "}
              <Input
                autoFocus
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder={"execution speed, readability, …"}
              />
            </Paragraph>

            <Paragraph>
              {IMPROVEMENTS.map((a) => (
                <Tag
                  key={a}
                  style={{ cursor: "pointer" }}
                  onClick={() => setExtra(a)}
                  color={getRandomColor(a)}
                >
                  {a}
                </Tag>
              ))}
            </Paragraph>
          </>
        );
      case "explain":
        return (
          <Paragraph>
            <Flex align="center" gap="10px">
              <Flex flex={0}>
                <Switch
                  defaultChecked={stepByStep}
                  onChange={(val) => setStepByStep(val)}
                  unCheckedChildren={"Summary"}
                  checkedChildren={"Step-by-step"}
                />
              </Flex>
              <Flex flex={1}>
                <Text type="secondary">
                  How to explain code? Either a high-level summary or
                  step-by-step explanations.
                </Text>
              </Flex>
            </Flex>
          </Paragraph>
        );
      case "translate":
        const other = TARGET_LANGS.filter(
          (l) => l.toLocaleLowerCase() !== kernelLanguage.toLocaleLowerCase(),
        );
        const dflt: TargetLanguage =
          kernelLanguage.toLocaleLowerCase() === "python" ? "R" : "Python";
        return (
          <Paragraph>
            <Text>Target language:</Text>{" "}
            <Select
              defaultValue={dflt}
              onChange={(val) => setTargetLanguage(val as TargetLanguage)}
              options={other.map((l) => {
                return { key: l, label: l, value: l };
              })}
              popupMatchSelectWidth={false}
            />
          </Paragraph>
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
            defaultChecked={mode === "bugfix"}
            onChange={(val) => setIncludeOutput(val)}
            unCheckedChildren={"No output"}
            checkedChildren={"Include output"}
          />
        </Flex>
        <Flex flex={1}>
          <Text type="secondary">
            Including the cell's output helps {modelToName(llmTools.model)} to
            better understand the code, but makes the prompt larger!
          </Text>
        </Flex>
      </Flex>
    );
  }

  async function onConfirm() {
    setIsQuerying(true);
    try {
      await getExplanation(false);
      track("jupyter_cell_llm", { action: "submitted", mode });
    } catch (err) {
      setError(`${err}`);
    } finally {
      setMode(null);
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
      <Paragraph strong>
        {capitalize(mode)} this cell using{" "}
        <LLMSelector
          model={llmTools.model}
          setModel={llmTools.setModel}
          project_id={project_id}
        />
        <CloseX2 close={() => setMode(null)} />
      </Paragraph>
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
