/*
Use a language model to explain what the code in a cell does.
*/

// cSpell:ignore algpseudocodex algorithmicx formulize

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
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { defineMessage, FormattedMessage, useIntl } from "react-intl";
import { Entries } from "type-fest";
import { LanguageSelector } from "@cocalc/frontend/account/i18n-selector";
import { useAsyncEffect } from "@cocalc/frontend/app-framework";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import { A, Paragraph, RawPrompt, Text } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { LLMHistorySelector } from "@cocalc/frontend/frame-editors/llm/llm-history-selector";
import { LLMQueryDropdownButton } from "@cocalc/frontend/frame-editors/llm/llm-query-dropdown";
import LLMSelector, {
  modelToMention,
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { useLLMHistory } from "@cocalc/frontend/frame-editors/llm/use-llm-history";
import {
  IntlMessage,
  labels,
  Locale,
  LOCALIZATIONS,
} from "@cocalc/frontend/i18n";
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
import {
  CellContextContent,
  getNonemptyCellContents,
} from "../util/cell-content";
import { LLMCellContextSelector } from "./cell-context-selector";

interface Props {
  actions?: JupyterActions;
  id: string;
  style?: CSSProperties;
  llmTools?: LLMTools;
  cellType: "code" | "markdown";
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

const MODES_CODE = [
  "ask",
  "explain",
  "bugfix",
  "modify",
  "improve",
  "document",
  "translate",
] as const;

const MODES_MD = [
  "ask",
  "document",
  "proofread",
  "formulize",
  "translate_text",
] as const;

export type CodeMode = (typeof MODES_CODE)[number];
export type MarkdownMode = (typeof MODES_MD)[number];
export type Mode = CodeMode | MarkdownMode;

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

const ASK_LABEL = defineMessage({
  id: "jupyter.llm.cell-tool.actions.ask.label",
  defaultMessage: "Ask",
  description: "Verb: ask a question about this jupyter cell",
});

const IMPROVEMENTS = [
  "code quality", // first entry will be filled in by default, as a convenience
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
    value: "Rewrite the code according to best practices.",
  },
] as const;

const jupyterCell = ({ language, kernel_display }) =>
  `provided ${capitalize(
    language,
  )} code in a Jupyter Notebook cell (kernel: "${kernel_display}")`;

interface LLMInputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  multiline?: boolean;
  historyPrompts: string[];
  isQuerying: boolean;
}

function LLMInput({
  label,
  placeholder,
  value,
  onChange,
  onKeyDown,
  multiline,
  historyPrompts,
  isQuerying,
}: LLMInputProps) {
  const inputRef = useRef<any>(null);

  useEffect(() => {
    // Focus the input and select existing text when the component mounts (dialog opens)
    if (inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        // Select all existing text if there is any
        if (value && inputRef.current?.input) {
          inputRef.current.input.select();
        }
      }, 100);
    }
  }, []);

  const inputComponent = multiline ? (
    <Input.TextArea
      ref={inputRef}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      rows={3}
      style={{ width: "100%" }}
    />
  ) : (
    <Input
      ref={inputRef}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      style={{ width: "100%" }}
    />
  );

  return (
    <Flex gap="10px" align="center" style={{ width: "100%" }}>
      {label}:
      <Space.Compact
        style={{ width: "100%", display: "flex", alignItems: "stretch" }}
      >
        {inputComponent}
        <LLMHistorySelector
          prompts={historyPrompts}
          onSelect={onChange}
          disabled={isQuerying}
          alignSelf="stretch"
        />
      </Space.Compact>
    </Flex>
  );
}

const ACTIONS_CODE: { [mode in CodeMode]: LLMTool } = {
  ask: {
    icon: "question-circle",
    label: ASK_LABEL,
    descr: defineMessage({
      id: "jupyter.llm.cell-tool.actions.ask.descr",
      defaultMessage:
        "Ask a custom question about this cell with optional context from surrounding cells.",
    }),
    prompt: ({ language, kernel_display, extra }) =>
      `Your task is to answer the following question about the ${jupyterCell({
        language,
        kernel_display,
      })}. Use the context from surrounding cells if provided to give a more comprehensive answer.\n\n${extra}`,
  },
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
      } of the ${jupyterCell({ language, kernel_display })}:`,
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
        "Describe the problem in the cell to get a bug-fixed version.",
    }),
    prompt: ({ language, extra, kernel_display }) =>
      `Your task is to analyze the ${jupyterCell({
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
      `Your task is to modify the ${jupyterCell({
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
      `Your task is to analyze the ${jupyterCell({
        language,
        kernel_display,
      })}. Identify any areas of improvements. The new code must be functional, efficient, and adhere to best practices. Explain how your code improves it.${
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
      `Your task is to add documentation to the ${jupyterCell({
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

const ACTIONS_MD: { [mode in MarkdownMode]: LLMTool } = {
  ask: {
    icon: "question-circle",
    label: ASK_LABEL,
    descr: defineMessage({
      id: "jupyter.llm.cell-tool.actions.md.ask.descr",
      defaultMessage:
        "Ask a custom question about this cell with optional context from surrounding cells.",
    }),
    prompt: ({ extra }) =>
      `Your task is to answer the following question about the provided Markdown content. Use the context from surrounding cells if provided to give a more comprehensive answer.\n\n${extra}`,
  },
  document: {
    icon: "book",
    label: defineMessage({
      id: "jupyter.llm.cell-tool.actions.md.document.label",
      defaultMessage: "Document",
      description:
        "Label on a button to write a documentation, i.e. to 'document' this",
    }),
    descr: defineMessage({
      id: "jupyter.llm.cell-tool.actions.md.document.descr",
      defaultMessage: "Write a summary about all the cells in the context",
    }),
    prompt: ({ extra }) =>
      `Your task is to write comprehensive documentation based on the notebook context provided. Use the context from surrounding cells to understand the overall analysis or workflow, and enhance the current cell's content accordingly. ${
        extra ? `Focus specifically on: ${extra}` : ""
      }`,
  },
  proofread: {
    icon: "check-circle",
    label: defineMessage({
      id: "jupyter.llm.cell-tool.actions.md.proofread.label",
      defaultMessage: "Proofread",
    }),
    descr: defineMessage({
      id: "jupyter.llm.cell-tool.actions.md.proofread.descr",
      defaultMessage: "Enhance language, fix spelling and grammar errors.",
    }),
    prompt: () =>
      `Your task is to proofread the provided Markdown text. Fix spelling and grammar errors, improve clarity and readability, and enhance the overall language quality while preserving the original meaning and structure.`,
  },
  formulize: {
    icon: "fx",
    label: defineMessage({
      id: "jupyter.llm.cell-tool.actions.md.formulize.label",
      defaultMessage: "Add Formulas",
    }),
    descr: defineMessage({
      id: "jupyter.llm.cell-tool.actions.md.formulize.descr",
      defaultMessage:
        "Add mathematical formulas to make text more readable for scientists.",
    }),
    prompt: () =>
      `Your task is to enhance the provided Markdown text by adding appropriate mathematical formulas to make it more readable for scientists. Use LaTeX math notation with $...$ for inline formulas and $$...$$ for display formulas. You can also use equation environments when appropriate. Keep all original content but add relevant mathematical expressions where they would enhance understanding.`,
  },
  translate_text: {
    icon: "global",
    label: defineMessage({
      id: "jupyter.llm.cell-tool.actions.md.translate-text.label",
      defaultMessage: "Translate",
    }),
    descr: defineMessage({
      id: "jupyter.llm.cell-tool.actions.md.translate-text.descr",
      defaultMessage: "Translate the text content to another human language.",
    }),
    prompt: ({ target = "Spanish" }) =>
      `Your task is to translate the provided Markdown text to ${target}. Preserve the Markdown formatting and structure, including any LaTeX formulas, code blocks, and other markup elements. Only translate the actual text content.`,
  },
} as const;

export function LLMCellTool({ actions, id, style, llmTools, cellType }: Props) {
  const { actions: project_actions, onCoCalcCom } = useProjectContext();
  const intl = useIntl();
  const { project_id, path } = useFrameContext();
  const frameActions = useNotebookFrameActions();
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [extraBug, setExtraBug] = useState<string>("");
  const [extraImprove, setExtraImprove] = useState<string>(IMPROVEMENTS[0]);
  const [extraModify, setExtraModify] = useState<string>(
    MODIFICATIONS[0].value,
  );
  const [extraAsk, setExtraAsk] = useState<string>("");
  const [targetLanguage, setTargetLanguage] =
    useState<TargetLanguage>("Python");
  const [otherLanguage, setOtherLanguage] = useState("");
  const [targetTextLanguage, setTargetTextLanguage] = useState<Locale>("es"); // Default to Spanish
  const [includeOutput, setIncludeOutput] = useState<boolean>(false);
  const [stepByStep, setStepByStep] = useState<boolean>(true);
  const [message, setMessage] = useState<string>("");
  const [tokens, setTokens] = useState<number>(0);
  const { prompts: historyPrompts, addPrompt } = useLLMHistory("general");

  // Context selection for document mode
  const [contextRange, setContextRange] = useState<[number, number]>([-2, 2]);
  const [cellTypes, setCellTypes] = useState<"all" | "code">("all");

  const kernelLanguage = useMemo((): string => {
    const kernel_info = actions?.store.get("kernel_info");
    return kernel_info?.get("language")?.toLowerCase() ?? "python";
  }, [actions?.store.get("kernel_info")]);

  const isMarkdownCell = cellType === "markdown";

  const getAction = (mode: Mode): LLMTool => {
    if (isMarkdownCell) {
      return ACTIONS_MD[mode as MarkdownMode];
    } else {
      return ACTIONS_CODE[mode as CodeMode];
    }
  };

  // Map language codes to full language names for translate_text mode
  const getLanguageName = (code: string): string => {
    return LOCALIZATIONS[code as keyof typeof LOCALIZATIONS]?.name ?? code;
  };

  // Show context selection for:
  // - ask, bugfix and explain
  // - document mode (markdown cells only)
  const showContext: boolean =
    mode === "ask" ||
    mode === "explain" ||
    mode === "bugfix" ||
    mode === "document";

  const getContextContent = (): CellContextContent => {
    if (!showContext) return {};

    // contextRange is like [-2, 2], so aboveCount should be 2, belowCount should be 2
    const aboveCount = Math.abs(contextRange[0]);
    const belowCount = Math.abs(contextRange[1]);

    return getNonemptyCellContents({
      actions: frameActions.current,
      id,
      cellTypes,
      lang: kernelLanguage,
      aboveCount,
      belowCount,
    });
  };

  const extra = (() => {
    switch (mode) {
      case "ask":
        return extraAsk;
      case "bugfix":
        return extraBug;
      case "improve":
        return extraImprove;
      case "modify":
        return extraModify;
      case "document":
        return extraAsk; // For markdown document mode, reuse the ask input
      default:
        return "";
    }
  })();

  const isSubmitDisabled: boolean = (() => {
    if (mode == null) return true;
    switch (mode) {
      case "ask":
        return !extraAsk.trim();
      case "bugfix":
        return !extraBug.trim();
      case "improve":
        return !extraImprove.trim();
      case "modify":
        return !extraModify.trim();
      case "explain":
        return false;
      case "document":
        return false; // Document mode should never be disabled
      case "translate":
        return targetLanguage === OTHER_LANG && !otherLanguage.trim();
      case "translate_text":
        return !targetTextLanguage;
      case "proofread":
      case "formulize":
        return false;
      default:
        unreachable(mode);
        return false;
    }
  })();

  useEffect(() => {
    if (mode !== "translate") return;
    // we change the target language to R, if the cell language is python – otherwise target is python
    // we change the target language, if it is the same as the kernel language
    if (targetLanguage.toLocaleLowerCase() === kernelLanguage) {
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
    cellTypes,
    contextRange,
    extra,
    includeOutput,
    otherLanguage,
    stepByStep,
    targetLanguage,
    targetTextLanguage,
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

    const prompt = getAction(mode).prompt({
      language,
      kernel_display,
      extra,
      target:
        mode === "translate_text"
          ? getLanguageName(targetTextLanguage)
          : targetLanguage === OTHER_LANG
            ? otherLanguage
            : targetLanguage,
      stepByStep,
    });

    // do not import until needed -- it is HUGE!
    const { truncateMessage, getMaxTokens, numTokensUpperBound } = await import(
      "@cocalc/frontend/misc/llm"
    );

    const chunks: string[] = [];

    chunks.push(prompt);

    if (!preview) chunks.push(`<details${preview ? " open" : ""}>`);

    // Add context for ask and document modes (inside details)
    let contextContent: CellContextContent | null = null;
    if (showContext) {
      contextContent = getContextContent();
      if (contextContent.before || contextContent.after) {
        chunks.push("Context from surrounding cells:");

        if (contextContent.before) {
          chunks.push("Cells BEFORE current cell:");
          chunks.push(`<before>\n${contextContent.before}\n</before>`);
        }

        if (contextContent.after) {
          chunks.push("Cells AFTER current cell:");
          chunks.push(`<after>\n${contextContent.after}\n</after>`);
        }

        chunks.push(""); // Add empty line for separation
      }
    }

    // For modes with context, label the current cell content
    if (
      contextContent != null &&
      (contextContent.before || contextContent.after)
    ) {
      chunks.push("Current cell content:");
    }

    const input = cell.get("input");
    const delimI = backtickSequence(input);

    chunks.push(
      `${delimI}${isMarkdownCell ? "markdown" : language}\n${input}\n${delimI}`,
    );
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
    const actions = isMarkdownCell ? ACTIONS_MD : ACTIONS_CODE;

    return (
      <Dropdown
        trigger={["click"]}
        mouseLeaveDelay={1.5}
        menu={{
          items: (Object.entries(actions) as Entries<typeof actions>).map(
            ([mode, action]) => {
              return {
                key: mode,
                label: (
                  <Tooltip
                    title={intl.formatMessage(action.descr)}
                    placement={"left"}
                  >
                    <Icon name={action.icon} style={{ marginRight: "5px" }} />{" "}
                    {intl.formatMessage(action.label)}…
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
      case "ask":
        return (
          <Paragraph type="secondary">
            <FormattedMessage
              id="jupyter.llm.cell-tool.explanation.ask"
              defaultMessage={`Ask any question about the code in this cell. The language model will analyze the code and provide an answer based on your specific question.`}
            />
          </Paragraph>
        );
      case "improve":
        return (
          <Paragraph type="secondary">
            <FormattedMessage
              id="jupyter.llm.cell-tool.explanation.improve"
              defaultMessage={`The selected language model will analyze the code and suggest
                              improvements. Beware, that the results are not guaranteed to be
                              correct, nor could cause subtle problems – review them carefully.`}
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
              defaultMessage={
                isMarkdownCell
                  ? `The language model will write comprehensive documentation based on the context from surrounding cells and enhance the current cell's content.`
                  : `The language model will add documentation lines to the code in the cell.`
              }
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
      case "proofread":
        return (
          <Paragraph type="secondary">
            <FormattedMessage
              id="jupyter.llm.cell-tool.explanation.proofread"
              defaultMessage={`The language model will proofread the markdown text, fixing spelling
                              and grammar errors while enhancing clarity and readability.`}
            />
          </Paragraph>
        );
      case "formulize":
        return (
          <Paragraph type="secondary">
            <FormattedMessage
              id="jupyter.llm.cell-tool.explanation.formulize"
              defaultMessage={`The language model will add appropriate mathematical formulas using
                              LaTeX notation to make the text more readable for scientists.`}
            />
          </Paragraph>
        );
      case "translate_text":
        return (
          <Paragraph type="secondary">
            <FormattedMessage
              id="jupyter.llm.cell-tool.explanation.translate-text"
              defaultMessage={`The language model will translate the markdown text to the selected
                              language while preserving formatting and structure.`}
            />
          </Paragraph>
        );
      default:
        unreachable(mode);
        return null;
    }
  }

  function renderControls() {
    switch (mode) {
      case "ask": {
        const label = intl.formatMessage({
          id: "jupyter.llm.cell-tool.ask.label",
          defaultMessage: "Question",
        });
        const placeholder = intl.formatMessage({
          id: "jupyter.llm.cell-tool.ask.placeholder",
          defaultMessage: `What would you like to know about this ${
            cellType === "code" ? "code" : "text"
          }?`,
        });
        return (
          <LLMInput
            label={label}
            placeholder={placeholder}
            value={extraAsk}
            onChange={setExtraAsk}
            onKeyDown={handleKeyDown}
            historyPrompts={historyPrompts}
            isQuerying={isQuerying}
          />
        );
      }

      case "bugfix": {
        const label = intl.formatMessage({
          id: "jupyter.llm.cell-tool.bugfix.label",
          defaultMessage: "Bug",
        });
        const placeholder = intl.formatMessage({
          id: "jupyter.llm.cell-tool.bugfix.placeholder",
          defaultMessage: "Describe the problem to fix…",
        });
        return (
          <LLMInput
            label={label}
            placeholder={placeholder}
            value={extraBug}
            onChange={setExtraBug}
            onKeyDown={handleKeyDown}
            historyPrompts={historyPrompts}
            isQuerying={isQuerying}
          />
        );
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
            <LLMInput
              label={label}
              placeholder={placeholder}
              value={extraImprove}
              onChange={setExtraImprove}
              onKeyDown={handleKeyDown}
              historyPrompts={historyPrompts}
              isQuerying={isQuerying}
            />
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
            <LLMInput
              label={label}
              placeholder={placeholder}
              value={extraModify}
              onChange={setExtraModify}
              onKeyDown={handleKeyDown}
              historyPrompts={historyPrompts}
              isQuerying={isQuerying}
            />
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
                value={targetLanguage}
                onChange={(val) => setTargetLanguage(val as TargetLanguage)}
                options={other.map((l) => {
                  return { key: l, label: l, value: l };
                })}
                popupMatchSelectWidth={false}
              />
              {targetLanguage === OTHER_LANG ? (
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

      case "translate_text":
        return (
          <Paragraph>
            <Space direction="horizontal">
              <Text>Target language:</Text>
              <LanguageSelector
                value={targetTextLanguage}
                onChange={(lang) => setTargetTextLanguage(lang)}
                style={{ minWidth: "200px" }}
              />
            </Space>
          </Paragraph>
        );

      case "document":
        if (isMarkdownCell) {
          const label = intl.formatMessage({
            id: "jupyter.llm.cell-tool.document.label",
            defaultMessage: "Focus",
          });
          const placeholder = intl.formatMessage({
            id: "jupyter.llm.cell-tool.document.placeholder",
            defaultMessage:
              "What should the documentation focus on? (optional)",
          });
          return (
            <LLMInput
              label={label}
              placeholder={placeholder}
              value={extraAsk}
              onChange={setExtraAsk}
              onKeyDown={handleKeyDown}
              historyPrompts={historyPrompts}
              isQuerying={isQuerying}
            />
          );
        }
        return null;

      case "proofread":
      case "formulize":
      case null:
        return null; // These modes don't need additional controls

      default:
        unreachable(mode);
    }
    return null;
  }

  function renderContextSelection() {
    if (!showContext) return null;

    return (
      <LLMCellContextSelector
        contextRange={contextRange}
        onContextRangeChange={setContextRange}
        cellTypes={cellTypes}
        onCellTypesChange={setCellTypes}
        currentCellId={id}
        frameActions={frameActions.current}
        mode="analysis"
      />
    );
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
        {renderContextSelection()}
        {renderIncludeOutput()}
        {renderPreviewLLM(model)}
        {renderFooter(model)}
      </Space>
    );
  }

  function renderIncludeOutput() {
    if (llmTools == null || isMarkdownCell) return;
    const output_label = defineMessage({
      id: "jupyter.llm.cell-tool.include-output.label",
      defaultMessage: `{include, select, true {Include output} other {No output}}`,
    });
    return (
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
    );
  }

  function renderPreviewLLM(model: LanguageModel) {
    if (llmTools == null) return;
    return (
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
                rawText
                style={{ border: "none", padding: "0", margin: "0" }}
              />
            ),
          },
        ]}
      />
    );
  }

  function renderFooter(model: LanguageModel) {
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
      // Add prompt to history based on mode
      if (mode && extra.trim()) {
        addPrompt(extra);
      }

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
                targetLanguage === OTHER_LANG ? otherLanguage : targetLanguage,
            }
          : null),
        ...(mode === "translate_text"
          ? {
              target: getLanguageName(targetTextLanguage),
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
          values={{ task: intl.formatMessage(getAction(mode).label) }}
        />{" "}
        <LLMSelector
          model={llmTools.model}
          setModel={llmTools.setModel}
          project_id={project_id}
        />
      </Paragraph>
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Only handle key events from input elements, not from other components like Slider
    const target = e.target as HTMLElement;
    if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
      return;
    }

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
            <LLMQueryDropdownButton
              onClick={onConfirm}
              llmTools={llmTools}
              disabled={isSubmitDisabled}
            />
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
