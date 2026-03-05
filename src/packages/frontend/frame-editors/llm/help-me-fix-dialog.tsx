/*
 *  This file is part of CoCalc: Copyright © 2020 - 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Modal dialog for AI-assisted error fixing.
Opens via show_react_modal (outside the app React root),
queries the LLM non-streaming, and logs an ai_assistance project event.
Supports interactive follow-up questions and Jupyter cell replacement.
*/

import { Alert, Button, Collapse, Input, Modal, Space } from "antd";
import { debounce } from "lodash";
import { defineMessage, useIntl } from "react-intl";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import {
  redux,
  useAsyncEffect,
  useMemo,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { Localize } from "@cocalc/frontend/app/localize";
import type { Message } from "@cocalc/frontend/client/types";
import {
  HelpIcon,
  Icon,
  Paragraph,
  RawPrompt,
} from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { LLMModelName } from "@cocalc/frontend/components/llm-name";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import type { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import { dialogs, labels } from "@cocalc/frontend/i18n";
import { LLMCellContextSelector } from "@cocalc/frontend/jupyter/llm/cell-context-selector";
import { splitCells } from "@cocalc/frontend/jupyter/llm/split-cells";
import { getNonemptyCellContents } from "@cocalc/frontend/jupyter/util/cell-content";
import { backtickSequence } from "@cocalc/frontend/markdown/util";
import { show_react_modal } from "@cocalc/frontend/misc";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { webapp_client } from "@cocalc/frontend/webapp-client";

import { createMessage } from "./help-me-fix-utils";
import LLMSelector from "./llm-selector";

const messages = {
  titleHint: defineMessage({
    id: "frame-editors.llm.help-me-fix-dialog.title.hint",
    defaultMessage: "Get a Hint",
    description: "Title for the AI hint dialog",
  }),
  titleFix: defineMessage({
    id: "frame-editors.llm.help-me-fix-dialog.title.fix",
    defaultMessage: "Fix this Problem",
    description: "Title for the AI fix dialog",
  }),
  promptPreview: defineMessage({
    id: "frame-editors.llm.help-me-fix-dialog.prompt-preview",
    defaultMessage: "Prompt preview",
    description: "Label for the collapsible prompt preview section",
  }),
  description: defineMessage({
    id: "frame-editors.llm.help-me-fix-dialog.description",
    defaultMessage:
      "{model} will {isHint, select, true {give you a hint} other {help fix your code}} based on the error context.",
    description: "Description of what the AI dialog does",
  }),
  followUpPlaceholder: defineMessage({
    id: "frame-editors.llm.help-me-fix-dialog.follow-up-placeholder",
    defaultMessage: "Refine the fix…",
    description: "Placeholder text for the follow-up input",
  }),
  replace: defineMessage({
    id: "frame-editors.llm.help-me-fix-dialog.replace",
    defaultMessage: "Replace",
    description: "Button to replace Jupyter cell code with AI suggestion",
  }),
  refine: defineMessage({
    id: "frame-editors.llm.help-me-fix-dialog.refine",
    defaultMessage: "Refine",
    description: "Button label to refine the AI fix with a follow-up prompt",
  }),
  refineHelpTitle: defineMessage({
    id: "frame-editors.llm.help-me-fix-dialog.refine-help-title",
    defaultMessage: "Refine the Fix",
    description: "Title for the refine help popover",
  }),
  refineHelp: defineMessage({
    id: "frame-editors.llm.help-me-fix-dialog.refine-help",
    defaultMessage:
      "Type additional instructions here to adjust the suggested fix. Your text will be sent along with the previous conversation to the language model, so it can refine its answer. For example: use a different approach, handle edge cases, or explain a specific part.",
    description: "Help text explaining the refine input",
  }),
  replaceAndRun: defineMessage({
    id: "frame-editors.llm.help-me-fix-dialog.replace-and-run",
    defaultMessage: "Replace + Run",
    description:
      "Button to replace Jupyter cell code with AI suggestion and run it",
  }),
};

export interface ShowHelpMeFixDialogOpts {
  mode: "hint" | "solution";
  project_id: string;
  path: string;
  error: string;
  line?: string;
  lineNumber?: number;
  input?: string;
  task?: string;
  tag?: string;
  language?: string;
  extraFileInfo?: string;
  prioritize?: "start" | "start-end" | "end";
  onReplace?: (opts: { code: string; run?: boolean }) => void;
  cellId?: string;
  notebookFrameActions?: NotebookFrameActions;
}

export async function showHelpMeFixDialog(
  opts: ShowHelpMeFixDialogOpts,
): Promise<void> {
  await show_react_modal((cb) => (
    <Localize>
      <HelpMeFixDialog {...opts} cb={cb} />
    </Localize>
  ));
}

interface Props extends ShowHelpMeFixDialogOpts {
  cb: (err?: string) => void;
}

function HelpMeFixDialog({
  mode,
  project_id,
  path,
  error,
  line = "",
  lineNumber,
  input = "",
  task,
  tag,
  language,
  extraFileInfo,
  prioritize,
  onReplace,
  cellId,
  notebookFrameActions,
  cb,
}: Props) {
  const intl = useIntl();
  const isHint = mode === "hint";
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [generating, setGenerating] = useState<boolean>(false);
  const [response, setResponse] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [tokens, setTokens] = useState<number>(0);
  const [followUp, setFollowUp] = useState<string>("");
  const [contextRange, setContextRange] = useState<[number, number]>([-2, 0]);
  const [cellTypes, setCellTypes] = useState<"all" | "code">("code");
  const hasJupyterContext = cellId != null && notebookFrameActions != null;
  // Hint mode is single-shot per exact prompt+model; changing prompt re-enables.
  const [generatedHintSignature, setGeneratedHintSignature] =
    useState<string>("");
  // Follow-up is intentionally one-turn over the initial exchange (no chat history).
  const initialExchangeRef = useRef<Message[]>([]);
  const followUpInputRef = useRef<any>(null);

  const cellContext = useMemo((): string => {
    if (!hasJupyterContext) return "";
    const { before, after } = getNonemptyCellContents({
      actions: notebookFrameActions,
      id: cellId,
      cellTypes,
      lang: language,
      aboveCount: Math.abs(contextRange[0]),
      belowCount: contextRange[1],
    });
    const lang = language ?? "";
    const parts: string[] = [];
    if (before) {
      if (cellTypes === "code") {
        const delim = backtickSequence(before);
        parts.push(`**Cells before:**\n${delim}${lang}\n${before}\n${delim}`);
      } else {
        parts.push(`**Cells before:**\n${before}`);
      }
    }
    if (after) {
      if (cellTypes === "code") {
        const delim = backtickSequence(after);
        parts.push(`**Cells after:**\n${delim}${lang}\n${after}\n${delim}`);
      } else {
        parts.push(`**Cells after:**\n${after}`);
      }
    }
    if (parts.length === 0) return "";
    return `Context from surrounding cells:\n\n${parts.join("\n\n")}`;
  }, [hasJupyterContext, cellTypes, language, contextRange]);

  const promptText = createMessage({
    error,
    line,
    input,
    task,
    language,
    extraFileInfo,
    model,
    prioritize,
    open: true,
    full: false,
    isHint,
    cellContext,
  });

  const fullPromptText = createMessage({
    error,
    line,
    input,
    task,
    language,
    extraFileInfo,
    model,
    prioritize,
    open: true,
    full: true,
    isHint,
    cellContext,
  });
  const hintSignature = `${model}:${fullPromptText}`;

  // Extract the first code block from the LLM response
  const extractedCode = useMemo(() => {
    if (!response) return "";
    const cells = splitCells(response);
    const codeCell = cells.find((c) => c.cell_type === "code");
    if (!codeCell) return "";
    return codeCell.source.join("");
  }, [response]);

  useAsyncEffect(
    debounce(
      async () => {
        const { getMaxTokens, numTokensEstimate } =
          await import("@cocalc/frontend/misc/llm");
        setTokens(numTokensEstimate(promptText, getMaxTokens(model)));
      },
      500,
      { leading: true, trailing: true },
    ),
    [model, promptText],
  );

  async function doGenerate() {
    try {
      setErrorMsg("");
      setGenerating(true);
      setResponse("");

      const tagSuffix = isHint ? "hint" : "solution";
      const fullTag = `help-me-fix-${tagSuffix}${tag ? `:${tag}` : ""}`;

      const reply = await webapp_client.openai_client.query({
        input: fullPromptText,
        model,
        project_id,
        tag: fullTag,
      });

      setResponse(reply);
      setGeneratedHintSignature(hintSignature);
      initialExchangeRef.current = [
        { role: "user", content: fullPromptText },
        { role: "assistant", content: reply },
      ];

      logAssistance();
    } catch (err) {
      setErrorMsg(`${err}`);
    } finally {
      setGenerating(false);
    }
  }

  async function doFollowUp() {
    const text = followUp.trim();
    if (!text) return;
    try {
      setErrorMsg("");
      setGenerating(true);

      const tagSuffix = isHint ? "hint" : "solution";
      const fullTag = `help-me-fix-${tagSuffix}${tag ? `:${tag}` : ""}:followup`;

      const reply = await webapp_client.openai_client.query({
        input: text,
        history: initialExchangeRef.current,
        model,
        project_id,
        tag: fullTag,
      });

      setResponse(reply);

      logAssistance();
    } catch (err) {
      setErrorMsg(`${err}`);
    } finally {
      setGenerating(false);
      // Re-focus the input so users can immediately refine again
      setTimeout(() => followUpInputRef.current?.focus(), 100);
    }
  }

  function logAssistance() {
    try {
      let cellNumber: number | undefined;
      let cellIdForLog: string | undefined;
      if (hasJupyterContext && cellId && notebookFrameActions) {
        try {
          const index =
            notebookFrameActions.jupyter_actions?.store.get_cell_index(cellId);
          if (index != null) {
            cellNumber = index + 1;
            cellIdForLog = cellId;
          }
        } catch {
          cellNumber = undefined;
          cellIdForLog = undefined;
        }
      }
      const projectActions = redux.getProjectActions(project_id);
      projectActions?.log({
        event: "ai_assistance",
        mode: isHint ? "hint" : "fix",
        path,
        model,
        tag: tag ?? undefined,
        cellNumber,
        cellId: cellIdForLog,
        lineNumber,
      });
    } catch {
      // logging failure should not block the user
    }
  }

  function onClose() {
    cb();
  }

  function handleReplace(run?: boolean) {
    if (onReplace && extractedCode) {
      onReplace({ code: extractedCode, run });
      cb();
    }
  }

  function renderTitle() {
    return (
      <span>
        <AIAvatar size={20} />{" "}
        {intl.formatMessage(isHint ? messages.titleHint : messages.titleFix)}
      </span>
    );
  }

  function renderBody() {
    return (
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <div>
          {intl.formatMessage(dialogs.select_llm)}:{" "}
          <LLMSelector
            project_id={project_id}
            model={model}
            setModel={setModel}
          />
        </div>

        <Paragraph style={{ marginBottom: 0 }}>
          {intl.formatMessage(messages.description, {
            model: <LLMModelName model={model} size={18} />,
            isHint,
          })}
        </Paragraph>

        <Collapse
          size="small"
          items={[
            {
              key: "prompt",
              label: intl.formatMessage(messages.promptPreview),
              children: <RawPrompt input={promptText} />,
            },
          ]}
        />

        {hasJupyterContext && (
          <LLMCellContextSelector
            contextRange={contextRange}
            onContextRangeChange={setContextRange}
            cellTypes={cellTypes}
            onCellTypesChange={setCellTypes}
            currentCellId={cellId}
            frameActions={notebookFrameActions}
            mode="analysis"
          />
        )}

        {response && (
          <div
            style={{
              border: "1px solid #d9d9d9",
              borderRadius: "6px",
              padding: "12px",
              maxHeight: "400px",
              overflow: "auto",
            }}
          >
            <StaticMarkdown value={response} />
          </div>
        )}

        {response && !isHint && (
          <Space.Compact style={{ width: "100%" }}>
            <Button
              icon={
                <HelpIcon title={intl.formatMessage(messages.refineHelpTitle)}>
                  {intl.formatMessage(messages.refineHelp)}
                </HelpIcon>
              }
            />
            <Input
              ref={followUpInputRef}
              allowClear
              placeholder={intl.formatMessage(messages.followUpPlaceholder)}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onPressEnter={doFollowUp}
              disabled={generating}
            />
            <Button
              disabled={!followUp.trim() || generating}
              loading={generating}
              onClick={doFollowUp}
              icon={<Icon name="paper-plane" />}
            >
              {intl.formatMessage(messages.refine)}
            </Button>
          </Space.Compact>
        )}

        {errorMsg && (
          <Alert
            type="error"
            showIcon
            closable
            message={errorMsg}
            onClose={() => setErrorMsg("")}
          />
        )}

        <LLMCostEstimation
          model={model}
          tokens={tokens}
          type="secondary"
          paragraph
        />
      </Space>
    );
  }

  const showReplaceButtons = !isHint && onReplace != null && !!extractedCode;
  const hasGeneratedResponse = response.trim() !== "";
  const showRegenerateAction = !isHint && hasGeneratedResponse;

  return (
    <Modal
      title={renderTitle()}
      open
      onCancel={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Button onClick={onClose}>{intl.formatMessage(labels.close)}</Button>
          <Space>
            {showReplaceButtons && (
              <Button
                onClick={() => handleReplace(false)}
                icon={<Icon name="replace" />}
              >
                {intl.formatMessage(messages.replace)}
              </Button>
            )}
            {showReplaceButtons && (
              <Button
                type="primary"
                onClick={() => handleReplace(true)}
                icon={<Icon name="play" />}
              >
                {intl.formatMessage(messages.replaceAndRun)}
              </Button>
            )}
            <Button
              type="primary"
              loading={generating}
              disabled={
                generating ||
                (isHint && generatedHintSignature === hintSignature)
              }
              onClick={doGenerate}
              icon={
                <Icon
                  name={
                    isHint
                      ? "lightbulb"
                      : showRegenerateAction
                        ? "refresh"
                        : "paper-plane"
                  }
                />
              }
            >
              {intl.formatMessage(
                showRegenerateAction
                  ? labels.regenerate
                  : isHint
                    ? messages.titleHint
                    : messages.titleFix,
              )}
            </Button>
          </Space>
        </div>
      }
      width={{ xs: "90vw", sm: "90vw", md: "80vw", lg: "70vw", xl: "60vw" }}
    >
      {renderBody()}
    </Modal>
  );
}
