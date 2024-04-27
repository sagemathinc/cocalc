/*
Use a language model to explain what the code in a cell does.
*/

import {
  Alert,
  Button,
  Collapse,
  Dropdown,
  Flex,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import { CSSProperties, useEffect, useMemo, useState } from "react";
import { Entries } from "type-fest";

import { CSS, useAsyncEffect } from "@cocalc/frontend/app-framework";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import { A, Paragraph, Text } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import LLMSelector, {
  modelToMention,
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { LLMEvent } from "@cocalc/frontend/project/history/types";
import track from "@cocalc/frontend/user-tracking";
import { LLMTools } from "@cocalc/jupyter/types";
import { LanguageModel } from "@cocalc/util/db-schema/llm-utils";
import { capitalize, getRandomColor, unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { JupyterActions } from "../browser-actions";
import { CODE_BAR_BTN_STYLE } from "../consts";
import { cellOutputToText } from "../output-messages/ansi";
import { RawPrompt } from "./raw-prompt";

interface Props {
  actions?: JupyterActions;
  id: string;
  style?: CSSProperties;
  llmTools?: LLMTools;
  is_current?: boolean;
}

const CONTENT_WIDTH = 600;

const TRACKING_KEY = "jupyter-cell-llm";

const OTHER_LANG = "Other";
const TARGET_LANGS = [
  "Python",
  "R",
  "SageMath",
  "Julia",
  "Octave",
  "JavaScript",
  "C/C++",
  "Java",
  "Matlab",
  OTHER_LANG,
] as const;

type TargetLanguage = (typeof TARGET_LANGS)[number];

const MODES = [
  "explain",
  "bugfix",
  "modify",
  "improve",
  "document",
  "translate",
] as const;
export type Mode = (typeof MODES)[number];

type PromptGen = ({
  language,
  kernel_display,
  target,
  extra,
  stepByStep,
}: {
  language: string;
  kernel_display: string;
  extra?: string;
  target?: TargetLanguage | string;
  stepByStep?: boolean;
}) => string;

interface LLMTool {
  icon: string;
  descr: string;
  prompt: PromptGen;
}

const IMPROVEMENTS = [
  "code quality", // first entry will be filled in by default, as a convencience
  "execution speed",
  "memory usage",
  "readability",
  "documentation",
  "style",
] as const;

const MODIFICATIONS: Readonly<{ label: string; value: string }[]> = [
  {
    label: "Simplify",
    value: "Make the code more readable and easier to understand.",
  },
  {
    label: "Generalize",
    value: "Replace constant values and strings with variables.",
  },
  { label: "Variables", value: "Replace variable x with y." },
  { label: "Function", value: "Wrap the code in a function." },
  {
    label: "Refactor",
    value: "Rrewrite the code according to best practices.",
  },
] as const;

const jupytercell = ({ language, kernel_display }) =>
  `provided ${capitalize(
    language,
  )} code in a Jupyter Notebook cell (kernel: "${kernel_display}")`;

const ACTIONS: { [mode in Mode]: LLMTool } = {
  explain: {
    icon: "sound-outlined",
    descr: "Gain some insight into the code in that cell.",
    prompt: ({ language, stepByStep, kernel_display }) =>
      `Your task is to give a ${
        stepByStep ? `step-by-step explanation` : `short high-level summary`
      } of the ${jupytercell({ language, kernel_display })}:`,
  },
  bugfix: {
    icon: "clean-outlined",
    descr:
      "Describe the problem of that cell in order to get a bugfixed version.",
    prompt: ({ language, extra, kernel_display }) =>
      `Your task is to analyze the ${jupytercell({
        language,
        kernel_display,
      })}. Identify any bugs or errors. Explain the problems you found in the original code and how your fixes address them.${
        extra
          ? ` In particular, the problem you have to fix is: "${extra}".`
          : ""
      }`,
  },
  modify: {
    icon: "edit",
    descr: "Modify the code in the cell",
    prompt: ({ language, extra, kernel_display }) =>
      `Your task is to modify the ${jupytercell({
        language,
        kernel_display,
      })}. The modification is "${extra}"`,
  },
  improve: {
    icon: "rise-outlined",
    descr: "Improve the code in that cell.",
    prompt: ({ language, extra, kernel_display }) =>
      `Your task is to analyze the ${jupytercell({
        language,
        kernel_display,
      })}. Identify any areas of improvments. The new code must be functional, efficient, and adhere to best practices. Explain how your code improves it.${
        extra ? ` In particular, optimize this aspect: "${extra}"` : ""
      }`,
  },
  document: {
    icon: "book",
    descr: "Add documentation",
    prompt: ({ language, kernel_display }) =>
      `Your task is to add documentation to the ${jupytercell({
        language,
        kernel_display,
      })}. The new code must be exactly the same. Insert additional documentation comments and rewrite existing comments.`,
  },
  translate: {
    icon: "translation-outlined",
    descr: "Translate the code in that cell to another language using AI.",
    prompt: ({ language, target = "R" }) =>
      `Your task is to translate the provided ${capitalize(
        language,
      )} code to ${target}.`,
  },
} as const;

export function LLMCellTool({
  actions,
  id,
  style,
  llmTools,
  is_current,
}: Props) {
  const { actions: project_actions } = useProjectContext();
  const { project_id, path } = useFrameContext();
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [extraBug, setExtraBug] = useState<string>("");
  const [extraImprove, setExtraImprove] = useState<string>(IMPROVEMENTS[0]);
  const [extraModify, setExtraModify] = useState<string>(
    MODIFICATIONS[0].value,
  );
  const [targetLangauge, setTargetLanguage] =
    useState<TargetLanguage>("Python");
  const [otherLanguage, setOtherLanguage] = useState("");
  const [includeOutput, setIncludeOutput] = useState<boolean>(false);
  const [stepByStep, setStepByStep] = useState<boolean>(true);
  const [message, setMessage] = useState<string>("");
  const [tokens, setTokens] = useState<number>(0);

  const kernelLanguage = useMemo((): string => {
    const kernel_info = actions?.store.get("kernel_info");
    return kernel_info?.get("language")?.toLowerCase() ?? "python";
  }, [actions?.store.get("kernel_info")]);

  const extra = useMemo(() => {
    switch (mode) {
      case "bugfix":
        return extraBug;
      case "improve":
        return extraImprove;
      case "modify":
        return extraModify;
      default:
        return "";
    }
  }, [mode, extraBug, extraImprove, extraModify]);

  useEffect(() => {
    if (mode !== "translate") return;
    // we change the target language to R, if the cell language is python – otherwise target is python
    // we change the target language, if it is the same as the kernel language
    if (targetLangauge.toLocaleLowerCase() === kernelLanguage) {
      setTargetLanguage(kernelLanguage === "python" ? "R" : "Python");
    }
  }, [mode, kernelLanguage]);

  useAsyncEffect(async () => {
    if (mode == null || llmTools == null) return;
    const { message, tokens } = await createMessage(true);
    setMessage(message);
    setTokens(tokens);
  }, [
    mode,
    id,
    actions,
    llmTools?.model,
    includeOutput,
    extra,
    targetLangauge,
    otherLanguage,
    stepByStep,
  ]);

  // end of hooks

  async function getExplanation(preview: boolean) {
    if (actions == null) return; // shouldn't happen
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
      tag: `jupyter-cell-llm:${mode}`,
      noNotification: true,
    });

    // we also log this
    const event: LLMEvent = {
      event: "llm",
      usage: "jupyter-cell-buttons",
      model: llmTools?.model,
      mode,
      path,
    };
    project_actions?.log(event);
  }

  async function createMessage(
    preview: boolean,
  ): Promise<{ message: string; tokens: number }> {
    const empty = { message: "", tokens: 0 };
    if (actions == null || mode == null || llmTools == null) return empty;
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
    if (mode == null || actions == null)
      return { message: "Error: no mode selected.", tokens: 0 };

    const kernel_info = actions.store.get("kernel_info");
    const language = kernel_info.get("language");
    const kernel_display = kernel_info.get("display_name");
    const prompt = ACTIONS[mode].prompt({
      language,
      kernel_display,
      extra,
      target: targetLangauge === OTHER_LANG ? otherLanguage : targetLangauge,
      stepByStep,
    });

    // do not import until needed -- it is HUGE!
    const { truncateMessage, getMaxTokens, numTokensUpperBound } = await import(
      "@cocalc/frontend/misc/llm"
    );

    const chunks: string[] = [];

    chunks.push(prompt);

    if (!preview) chunks.push(`<details${preview ? " open" : ""}>`);
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
    const txtStyle: CSS = is_current
      ? {
          color: COLORS.AI_ASSISTANT_FONT,
          // this makes it bold without "moving around"
          textShadow: `1px 0 0 ${COLORS.AI_ASSISTANT_FONT}`,
        }
      : {};

    return (
      <Dropdown
        trigger={["click"]}
        mouseLeaveDelay={1.5}
        menu={{
          items: (Object.entries(ACTIONS) as Entries<typeof ACTIONS>).map(
            ([mode, action]) => {
              return {
                key: mode,
                label: (
                  <Tooltip title={action.descr} placement={"left"}>
                    <Icon name={action.icon} /> {capitalize(mode)}
                  </Tooltip>
                ),
                onClick: () => {
                  setMode(mode as Mode);
                  track(TRACKING_KEY, {
                    action: "selected",
                    mode,
                    path,
                    project_id,
                  });
                },
              };
            },
          ),
        }}
      >
        <Tooltip title="Use AI assistance on this cell">
          <Button
            disabled={isQuerying}
            type="text"
            size="small"
            style={CODE_BAR_BTN_STYLE}
            icon={
              <AIAvatar
                size={14}
                style={{ position: "relative", top: "-4px", left: "4px" }}
                iconColor={is_current ? COLORS.AI_ASSISTANT_FONT : undefined}
              />
            }
          >
            <Space size="small">
              <span style={txtStyle}>Tools</span>
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
      case "modify":
        return (
          <Paragraph type="secondary">
            The language model will modify the code according to the given
            instructions. Pick one of the templates and modify it, or come up
            with some instructions of your own!
          </Paragraph>
        );
      case "document":
        return (
          <Paragraph type="secondary">
            The language model will add documentation lines to the code in the
            cell.
          </Paragraph>
        );
      case "translate":
        return (
          <Paragraph>
            The language model will attempt to translate the code in the cell to
            another programming language. The result might not work at all – but
            if you're more familiar with the selected target language, you might
            find it easier to understand what's going on!
          </Paragraph>
        );
      default:
        unreachable(mode);
        return null;
    }
  }

  function renderInput(
    label: string,
    placeholder: string,
    extra: string,
    setExtra: (s: string) => void,
  ) {
    if (mode == null) return;
    return (
      <Flex gap="10px" align="center" style={{ width: "100%" }}>
        {label}:
        <Input
          value={extra}
          placeholder={placeholder}
          onChange={(e) => setExtra(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ width: "100%" }}
        />
      </Flex>
    );
  }

  function renderControls() {
    switch (mode) {
      case "bugfix":
        return renderInput(
          "Bug",
          "Describe the problem to fix…",
          extraBug,
          setExtraBug,
        );

      case "improve":
        return (
          <>
            {renderInput(
              "Improvement",
              "execution speed, readability, …",
              extraImprove,
              setExtraImprove,
            )}
            <Paragraph>
              {IMPROVEMENTS.map((a) => (
                <Tag
                  key={a}
                  style={{ cursor: "pointer" }}
                  onClick={() => setExtraImprove(a)}
                  color={getRandomColor(a)}
                >
                  {a}
                </Tag>
              ))}
            </Paragraph>
          </>
        );

      case "modify":
        return (
          <>
            {renderInput(
              "Modification",
              "Describe what to change…",
              extraModify,
              setExtraModify,
            )}
            <Paragraph>
              {MODIFICATIONS.map(({ label, value }) => (
                <Tag
                  key={label}
                  style={{ cursor: "pointer" }}
                  onClick={() => setExtraModify(value)}
                  color={getRandomColor(value)}
                >
                  <Tooltip placement={"bottom"} title={value}>
                    {label}
                  </Tooltip>
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
          (l) => l.toLocaleLowerCase() !== kernelLanguage,
        );

        return (
          <Paragraph>
            <Space direction="horizontal">
              <Text>Target language:</Text>
              <Select
                value={targetLangauge}
                onChange={(val) => setTargetLanguage(val as TargetLanguage)}
                options={other.map((l) => {
                  return { key: l, label: l, value: l };
                })}
                popupMatchSelectWidth={false}
              />
              {targetLangauge === OTHER_LANG ? (
                <>
                  Other:
                  <Input
                    defaultValue={otherLanguage}
                    onChange={(e) => setOtherLanguage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter language..."
                    style={{ display: "inline-block" }}
                  />
                </>
              ) : undefined}
            </Space>
          </Paragraph>
        );
    }
    return null;
  }

  function renderContent() {
    if (mode == null || llmTools == null) return null;
    const { model } = llmTools;

    return (
      <Space
        direction="vertical"
        style={{
          width: `${CONTENT_WIDTH}px`,
          overflow: "auto",
          maxWidth: "90vw",
          maxHeight: "90vh",
        }}
      >
        {renderExplanation()}
        {renderControls()}
        {renderIncludeOutput(model)}
        {renderFooter(model)}
      </Space>
    );
  }

  function renderIncludeOutput(model) {
    if (llmTools == null) return;
    return (
      <>
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
              Including the cell's output helps {modelToName(llmTools.model)} to
              better understand the code, but makes the prompt larger!
            </Text>
          </Flex>
        </Flex>
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
      </>
    );
  }

  function renderFooter(model) {
    return (
      <>
        <Paragraph type="secondary">
          Submitting this message to {modelToName(model)} will initiate a chat
          in the{" "}
          <A href={"https://doc.cocalc.com/chat.html#side-chat"}>
            side-chat frame
          </A>
          . The language model replies and you can continue the conversation in
          the same thread.
        </Paragraph>
        <Paragraph style={{ textAlign: "right" }}>
          <LLMCostEstimation model={model} tokens={tokens} />
        </Paragraph>
      </>
    );
  }

  async function onConfirm() {
    setIsQuerying(true);
    try {
      await getExplanation(false);
      track(TRACKING_KEY, {
        action: "submitted",
        mode,
        path,
        project_id,
        ...(mode === "improve" || mode === "bugfix" || mode === "modify"
          ? { extra }
          : null),
        ...(mode === "explain" ? { stepByStep } : null),
        ...(mode === "translate"
          ? {
              language: kernelLanguage,
              target:
                targetLangauge === OTHER_LANG ? otherLanguage : targetLangauge,
            }
          : null),
      });
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
        <AIAvatar size={20} /> {capitalize(mode)} this cell using{" "}
        <LLMSelector
          model={llmTools.model}
          setModel={llmTools.setModel}
          project_id={project_id}
        />
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
      case "Enter":
        onConfirm();
        break;
      case "Escape":
        onCancel();
        break;
    }
  }

  return (
    <div style={style}>
      <Modal
        destroyOnClose
        width={CONTENT_WIDTH + 40}
        title={renderTitle()}
        open={mode != null}
        onOk={onConfirm}
        onCancel={onCancel}
        okText={renderOkText()}
      >
        {renderContent()}
      </Modal>

      {renderDropdown()}

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
