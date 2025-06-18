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
import { defineMessage, FormattedMessage, useIntl } from "react-intl";
import { Entries } from "type-fest";

import { useAsyncEffect } from "@cocalc/frontend/app-framework";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import { A, Paragraph, RawPrompt, Text } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { LLMQueryDropdownButton } from "@cocalc/frontend/frame-editors/llm/llm-query-dropdown";
import LLMSelector, {
  modelToMention,
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { IntlMessage, labels } from "@cocalc/frontend/i18n";
import { backtickSequence } from "@cocalc/frontend/markdown/util";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { LLMEvent } from "@cocalc/frontend/project/history/types";
import track from "@cocalc/frontend/user-tracking";
import { LLMTools } from "@cocalc/jupyter/types";
import { LanguageModel } from "@cocalc/util/db-schema/llm-utils";
import { capitalize, getRandomColor, unreachable } from "@cocalc/util/misc";
import { JupyterActions } from "../browser-actions";
import { CODE_BAR_BTN_STYLE } from "../consts";
import { cellOutputToText } from "../output-messages/ansi";

interface Props {
  actions?: JupyterActions;
  id: string;
  style?: CSSProperties;
  llmTools?: LLMTools;
}

const CONTENT_WIDTH = 600;

const TRACKING_KEY = "jupyter_cell_llm";

const OTHER_LANG = "Other";
const TARGET_LANGS = [
  "Python",
  "R",
  "SageMath",
  "Julia",
  "Octave",
  // LaTeX: the package is parsed from between the brackets, keep them!
  "LaTeX (algorithm2e)",
  "LaTeX (algpseudocodex)",
  "LaTeX (algorithmicx)",
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
  icon: IconName;
  label: IntlMessage;
  descr: IntlMessage;
  prompt: PromptGen;
}

const IMPROVEMENTS = [
  "code quality", // first entry will be filled in by default, as a convencience
  "execution speed",
  "memory usage",
  "readability",
  "easier to understand",
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
    label: defineMessage({
      id: "jupyter.llm.cell-tool.actions.explain.label",
      defaultMessage: "Explain",
    }),
    descr: defineMessage({
      id: "jupyter.llm.cell-tool.actions.explain.descr",
      defaultMessage: "Gain some insight into the code in that cell.",
    }),
    prompt: ({ language, stepByStep, kernel_display }) =>
      `Your task is to give a ${
        stepByStep ? `step-by-step explanation` : `short high-level summary`
      } of the ${jupytercell({ language, kernel_display })}:`,
  },
  bugfix: {
    icon: "clean-outlined",
    label: defineMessage({
      id: "jupyter.llm.cell-tool.actions.bugfix.label",
      defaultMessage: "Fix Bugs",
    }),
    descr: defineMessage({
      id: "jupyter.llm.cell-tool.actions.bugfix.descr",
      defaultMessage:
        "Describe the problem of that cell in order to get a bugfixed version.",
    }),
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
    label: defineMessage({
      id: "jupyter.llm.cell-tool.actions.modify.label",
      defaultMessage: "Modify",
    }),
    descr: defineMessage({
      id: "jupyter.llm.cell-tool.actions.modify.descr",
      defaultMessage: "Modify the code in the cell",
    }),
    prompt: ({ language, extra, kernel_display }) =>
      `Your task is to modify the ${jupytercell({
        language,
        kernel_display,
      })}. The modification is "${extra}"`,
  },
  improve: {
    icon: "rise-outlined",
    label: defineMessage({
      id: "jupyter.llm.cell-tool.actions.improve.label",
      defaultMessage: "Improve",
    }),
    descr: defineMessage({
      id: "jupyter.llm.cell-tool.actions.improve.descr",
      defaultMessage: "Improve the code in that cell.",
    }),
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
    label: defineMessage({
      id: "jupyter.llm.cell-tool.actions.document.label",
      defaultMessage: "Document",
      description:
        "Label on a button to write a documentation, i.e. to 'document' this",
    }),
    descr: defineMessage({
      id: "jupyter.llm.cell-tool.actions.document.descr",
      defaultMessage: "Add documentation",
    }),
    prompt: ({ language, kernel_display }) =>
      `Your task is to add documentation to the ${jupytercell({
        language,
        kernel_display,
      })}. The new code must be exactly the same. Insert additional documentation comments and rewrite existing comments.`,
  },
  translate: {
    icon: "translation-outlined",
    label: defineMessage({
      id: "jupyter.llm.cell-tool.actions.translate.label",
      defaultMessage: "Translate",
    }),
    descr: defineMessage({
      id: "jupyter.llm.cell-tool.actions.translate.descr",
      defaultMessage:
        "Translate the code in that cell to another language using AI.",
    }),
    prompt: ({ language, target = "R" }) => {
      let detail = "";
      if (target.startsWith("LaTeX")) {
        const pkgRe = /\\((.*?)\\)/g;
        const pkg = target.match(pkgRe)?.[1] ?? "algorithm2e";
        detail = ` using package "${pkg}". Wrap the LaTeX code in a codeblock and briefly explain how to insert it`;
        target = "LaTeX";
      }

      return `Your task is to translate the provided ${capitalize(
        language,
      )} code to ${target}${detail}.`;
    },
  },
} as const;

export function LLMCellTool({ actions, id, style, llmTools }: Props) {
  const { actions: project_actions, onCoCalcCom } = useProjectContext();
  const intl = useIntl();
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
    chatActions.sendChat({
      input: message,
      tag: `jupyter-cell-llm:${mode}`,
      noNotification: true,
    });

    // we also log this
    const event: LLMEvent = {
      event: "llm",
      usage: "jupyter-cell-button",
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
    const input = cell.get("input");
    const delimI = backtickSequence(input);
    chunks.push(`${delimI}${language}\n${input}\n${delimI}`);
    if (includeOutput) {
      chunks.push("Output:");
      const fullOutput = cellOutputToText(cell);

      // The output could be huge – we truncate to half of what we can send
      const maxTokens = getMaxTokens(model) / 2;
      const output = truncateMessage(fullOutput, maxTokens);
      const delimO = backtickSequence(output);
      chunks.push(`${delimO}text\n${output}\n${delimO}`);
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
                  <Tooltip
                    title={intl.formatMessage(action.descr)}
                    placement={"left"}
                  >
                    <Icon name={action.icon} style={{ marginRight: "5px" }} />{" "}
                    {intl.formatMessage(action.label)}
                  </Tooltip>
                ),
                onClick: () => setMode(mode as Mode),
              };
            },
          ),
        }}
      >
        <Tooltip
          title={intl.formatMessage({
            id: "jupyter.llm.cell-tool.assistant.title",
            defaultMessage: "Use AI assistant on this cell",
          })}
        >
          <Button
            disabled={isQuerying}
            type="text"
            size="small"
            style={CODE_BAR_BTN_STYLE}
            icon={<AIAvatar size={14} style={{ top: "1px" }} />}
          >
            <Space size="small">
              {intl.formatMessage(labels.assistant)}
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
            <FormattedMessage
              id="jupyter.llm.cell-tool.explanation.improve"
              defaultMessage={`The selected language model will analyze the code and suggest
                              improvements. Beware, that the results are not guaranteed to be
                              correct, nor could cause subtle problmes – review them carefully.`}
            />
          </Paragraph>
        );
      case "bugfix":
        return (
          <Paragraph type="secondary">
            <FormattedMessage
              id="jupyter.llm.cell-tool.explanation.bugfix"
              defaultMessage={`Explain the problem of the code in the cell and the selected
                              language model will attempt to fix it. Usually, it will tell you if
                              it found a problem and explain it to you.`}
            />
          </Paragraph>
        );
      case "explain":
        return (
          <Paragraph type="secondary">
            <FormattedMessage
              id="jupyter.llm.cell-tool.explanation.explain"
              defaultMessage={`The code in the cell will be sent to the selected language model.
                               It will explain the code to you in plain language.`}
            />
          </Paragraph>
        );
      case "modify":
        return (
          <Paragraph type="secondary">
            <FormattedMessage
              id="jupyter.llm.cell-tool.explanation.modify"
              defaultMessage={`The language model will modify the code according to the given
                              instructions. Pick one of the templates and modify it, or come up
                              with some instructions of your own!`}
            />
          </Paragraph>
        );
      case "document":
        return (
          <Paragraph type="secondary">
            <FormattedMessage
              id="jupyter.llm.cell-tool.explanation.document"
              defaultMessage={`The language model will add documentation lines to the code in the
            cell.`}
            />
          </Paragraph>
        );
      case "translate":
        return (
          <Paragraph>
            <FormattedMessage
              id="jupyter.llm.cell-tool.explanation.translate"
              defaultMessage={`The language model will attempt to translate the code in the cell to
                            another programming language. The result might not work at all – but
                            if you're more familiar with the selected target language, you might
                            find it easier to understand what's going on!`}
            />
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
      case "bugfix": {
        const label = intl.formatMessage({
          id: "jupyter.llm.cell-tool.bugfix.label",
          defaultMessage: "Bug",
        });
        const placeholder = intl.formatMessage({
          id: "jupyter.llm.cell-tool.bugfix.placeholder",
          defaultMessage: "Describe the problem to fix…",
        });
        return renderInput(label, placeholder, extraBug, setExtraBug);
      }

      case "improve": {
        const label = intl.formatMessage({
          id: "jupyter.llm.cell-tool.improve.label",
          defaultMessage: "Improvement",
        });
        const placeholder = intl.formatMessage({
          id: "jupyter.llm.cell-tool.improve.placeholder",
          defaultMessage: "execution speed, readability, …",
        });
        return (
          <>
            {renderInput(label, placeholder, extraImprove, setExtraImprove)}
            <Paragraph
              style={{ display: "flex", alignItems: "center", gap: "10px" }}
            >
              <div style={{ flex: "1 0 auto" }}>Examples:</div>
              <div style={{ flex: "1 1 auto" }}>
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
              </div>
            </Paragraph>
          </>
        );
      }

      case "modify": {
        const label = intl.formatMessage({
          id: "jupyter.llm.cell-tool.modify.label",
          defaultMessage: "Modification",
        });
        const placeholder = intl.formatMessage({
          id: "jupyter.llm.cell-tool.modify.placeholder",
          defaultMessage: "Describe what to change…",
        });
        return (
          <>
            {renderInput(label, placeholder, extraModify, setExtraModify)}
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
      }

      case "explain":
        const summary = intl.formatMessage({
          id: "jupyter.llm.cell-tool.explain.summary",
          defaultMessage: "Summary",
        });
        const step_by_step = intl.formatMessage({
          id: "jupyter.llm.cell-tool.explain.step-by-step",
          defaultMessage: "Step-by-step",
        });
        return (
          <Paragraph>
            <Flex align="center" gap="10px">
              <Flex flex={0}>
                <Switch
                  defaultChecked={stepByStep}
                  onChange={(val) => setStepByStep(val)}
                  unCheckedChildren={summary}
                  checkedChildren={step_by_step}
                />
              </Flex>
              <Flex flex={1}>
                <Text type="secondary">
                  <FormattedMessage
                    id="jupyter.llm.cell-tool.explain.description"
                    defaultMessage={`How to explain the code? Either a high-level {summary}
                      or {step_by_step} explanations.`}
                    values={{ summary, step_by_step }}
                  />
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
                  {intl.formatMessage(labels.other)}:
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
    const output_label = defineMessage({
      id: "jupyter.llm.cell-tool.include-output.label",
      defaultMessage: `{include, select, true {Include output} other {No output}}`,
    });
    return (
      <>
        <Flex align="center" gap="10px">
          <Flex flex={0}>
            <Switch
              onChange={(val) => setIncludeOutput(val)}
              unCheckedChildren={intl.formatMessage(output_label, {
                include: false,
              })}
              checkedChildren={intl.formatMessage(output_label, {
                include: true,
              })}
            />
          </Flex>
          <Flex flex={1}>
            <Text type="secondary">
              <FormattedMessage
                id="jupyter.llm.cell-tool.include-output.description"
                defaultMessage={`Including the cell's output helps {name} to
                                better understand the code, but makes the prompt larger!`}
                values={{ name: modelToName(llmTools.model) }}
              />
            </Text>
          </Flex>
        </Flex>
        <Collapse
          items={[
            {
              key: "1",
              label: (
                <FormattedMessage
                  id="jupyter.llm.cell-tool.preview"
                  defaultMessage={`Click to see what will be sent to {model}.`}
                  values={{ model: modelToName(model) }}
                />
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
          <FormattedMessage
            id="jupyter.llm.cell-tool.footer.info"
            defaultMessage={`Submitting this message to {model} will initiate a chat in the <A>side-chat frame</A>.
            The language model replies and you can continue the conversation in the same thread.`}
            values={{
              model: modelToName(model),
              A: (c) => (
                <A href={"https://doc.cocalc.com/chat.html#side-chat"}>{c}</A>
              ),
            }}
          />
        </Paragraph>
        {onCoCalcCom ? (
          <LLMCostEstimation
            type="secondary"
            paragraph
            model={model}
            tokens={tokens}
          />
        ) : undefined}
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
        model: llmTools?.model,
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
        <AIAvatar size={20} />{" "}
        <FormattedMessage
          id="jupyter.llm.cell-tool.title"
          defaultMessage={`{task} this cell using`}
          description={
            "Operate on a specific cell in a Jupyter Notebook. task are words like 'Explain', 'Fix', 'Document', 'Describe', ..."
          }
          values={{ task: intl.formatMessage(ACTIONS[mode].label) }}
        />{" "}
        <LLMSelector
          model={llmTools.model}
          setModel={llmTools.setModel}
          project_id={project_id}
        />
      </Paragraph>
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
        destroyOnHidden
        width={CONTENT_WIDTH + 40}
        title={renderTitle()}
        open={mode != null}
        onOk={onConfirm}
        onCancel={onCancel}
        footer={(_, { CancelBtn }) => (
          <Space>
            <CancelBtn />
            <LLMQueryDropdownButton onClick={onConfirm} llmTools={llmTools} />
          </Space>
        )}
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
