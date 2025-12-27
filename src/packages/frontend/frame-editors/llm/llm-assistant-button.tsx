/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore codegen

/*
A Language Model component that allows users to interact with ChatGPT and other language models.
for several text and code related function.  This calls the language model actions
to do the work.
*/

import type { MenuProps } from "antd";
import {
  Alert,
  Button,
  Dropdown,
  Input,
  Popover,
  Radio,
  Space,
  Tooltip,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { defineMessage, useIntl } from "react-intl";
import { useDebouncedCallback } from "use-debounce";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { Button as BSButton } from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  redux,
  useAsyncEffect,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Icon,
  IconName,
  LLMNameLink,
  Paragraph,
  Text,
  Title,
  VisibleMDLG,
} from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { IntlMessage, labels } from "@cocalc/frontend/i18n";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import track from "@cocalc/frontend/user-tracking";
import { LanguageModel, getMaxTokens } from "@cocalc/util/db-schema/llm-utils";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { isChatPath } from "@cocalc/frontend/chat/paths";
import { BaseEditorActions as Actions } from "../base-editor/actions-base";
import { AI_ASSIST_TAG } from "./consts";
import Context from "./context";
import { Options, createChatMessage } from "./create-chat";
import { useLLMHistory } from "./use-llm-history";
import { LLMHistorySelector } from "./llm-history-selector";
import LLMSelector, { modelToName } from "./llm-selector";
import TitleBarButtonTour from "./llm-assistant-tour";

import type { Scope } from "./types";

const TAG_TMPL = `${AI_ASSIST_TAG}-template`;

interface Preset {
  command: string;
  codegen: boolean;
  tag: string;
  icon: IconName;
  label: IntlMessage;
  description: IntlMessage;
}

const PRESETS: Readonly<Readonly<Preset>[]> = [
  {
    command: "Fix all errors in",
    codegen: true,
    tag: "fix-errors",
    icon: "bug",
    label: defineMessage({
      id: "frame-editors.llm.preset.fix-errors.label",
      defaultMessage: "Fix Errors",
      description: "LLM assistant preset label for fixing code errors",
    }),
    description: defineMessage({
      id: "frame-editors.llm.preset.fix-errors.description",
      defaultMessage: "Explain how to fix any mistakes it can find.",
      description: "LLM assistant preset description for fixing code errors",
    }),
  },
  {
    command: "Finish writing this",
    codegen: true,
    tag: "complete",
    icon: "pen",
    label: defineMessage({
      id: "frame-editors.llm.preset.complete.label",
      defaultMessage: "Autocomplete",
      description: "LLM assistant preset label for code autocompletion",
    }),
    description: defineMessage({
      id: "frame-editors.llm.preset.complete.description",
      defaultMessage:
        "Finish writing this. Language models can automatically write code, finish a poem, and much more.",
      description: "LLM assistant preset description for code autocompletion",
    }),
  },
  {
    command: "Explain in detail how this code works",
    codegen: false,
    tag: "explain",
    icon: "bullhorn",
    label: defineMessage({
      id: "frame-editors.llm.preset.explain.label",
      defaultMessage: "Explain",
      description: "LLM assistant preset label for explaining code",
    }),
    description: defineMessage({
      id: "frame-editors.llm.preset.explain.description",
      defaultMessage:
        "For example, you can select some code and will try to explain line by line how it works.",
      description: "LLM assistant preset description for explaining code",
    }),
  },
  {
    command: "Review for quality and correctness and suggest improvements",
    codegen: false,
    tag: "review",
    icon: "eye",
    label: defineMessage({
      id: "frame-editors.llm.preset.review.label",
      defaultMessage: "Review",
      description: "LLM assistant preset label for code review",
    }),
    description: defineMessage({
      id: "frame-editors.llm.preset.review.description",
      defaultMessage:
        "Review this for correctness and quality and suggest improvements.",
      description: "LLM assistant preset description for code review",
    }),
  },
  {
    command: "Add comments to",
    codegen: true,
    tag: "comment",
    icon: "comment",
    label: defineMessage({
      id: "frame-editors.llm.preset.comment.label",
      defaultMessage: "Add Comments",
      description: "LLM assistant preset label for adding comments",
    }),
    description: defineMessage({
      id: "frame-editors.llm.preset.comment.description",
      defaultMessage:
        "Tell you how to add comments so this is easier to understand.",
      description: "LLM assistant preset description for adding comments",
    }),
  },
  {
    command: "Summarize",
    codegen: false,
    tag: "summarize",
    icon: "bolt",
    label: defineMessage({
      id: "frame-editors.llm.preset.summarize.label",
      defaultMessage: "Summarize",
      description: "LLM assistant preset label for summarizing content",
    }),
    description: defineMessage({
      id: "frame-editors.llm.preset.summarize.description",
      defaultMessage: "Write a summary of this.",
      description: "LLM assistant preset description for summarizing content",
    }),
  },
] as const;

const CUSTOM_DESCRIPTIONS = {
  terminal:
    "Describe anything you might want to do in the Linux terminal: find files that contain 'foo', replace 'x' by 'y' in all files, clone a git repo, convert a.ipynb to markdown, etc.",
  jupyter_cell_notebook:
    "Try to do anything with the current cell or selection that you can possibly imagine: explain why this is slow and how to make it faster, draw a plot of sin(x), etc.",
  generic: (
    <div>
      You can try anything that you can possibly imagine: translate from one
      programming language to another, explain why code is slow, show the steps
      to solve an equation, etc.
    </div>
  ),
} as const;

function getCustomDescription(frameType) {
  return CUSTOM_DESCRIPTIONS[frameType] ?? CUSTOM_DESCRIPTIONS["generic"];
}

interface Props {
  id: string;
  path: string;
  type: string; // type of editor spec (the key)
  actions: Actions;
  buttonSize;
  buttonStyle: CSS;
  labels?: boolean;
  visible?: boolean;
  buttonRef;
  project_id: string;
  showDialog: boolean;
  setShowDialog: (boolean) => void;
  noLabel?: boolean;
}

export default function LanguageModelTitleBarButton({
  id,
  path,
  type,
  actions,
  buttonSize,
  buttonStyle,
  visible,
  buttonRef,
  project_id,
  showDialog,
  setShowDialog,
  noLabel,
}: Props) {
  const noContext = isChatPath(path);
  const intl = useIntl();
  const is_cocalc_com = useTypedRedux("customize", "is_cocalc_com");
  const [error, setError] = useState<string>("");
  const [command, setCommandVal] = useState<string>("");
  const frameType = actions._get_frame_type(id);
  const [querying, setQuerying] = useState<boolean>(false);
  const [tag, setTag] = useState<string>("");
  const showOptions = frameType != "terminal";
  const [context, setContext] = useState<string>("");
  const [truncated, setTruncated] = useState<number | null>(null);
  const [truncatedReason, setTruncatedReason] = useState<string>("");
  const [scope, setScope] = useState<Scope>(() =>
    showDialog ? getScope(id, actions) : "all",
  );
  const [tokens, setTokens] = useState<number>(0);
  const [description, setDescription] = useState<string>(
    showOptions ? "" : getCustomDescription(frameType),
  );
  const [message, setMessage] = useState<string>("");
  const [showPreview, setShowPreview] = useState<boolean>(false);

  const describeRef = useRef<any>(null);
  const examplesRef = useRef<HTMLElement>(null);
  const scopeRef = useRef<any>(null);
  const contextRef = useRef<any>(null);
  const submitRef = useRef<any>(null);
  const inputRef = useRef<HTMLElement>(null);

  const [model, setModel] = useLanguageModelSetting(project_id);
  const { prompts: historyPrompts, addPrompt } = useLLMHistory("general");

  function setPreset(preset: Preset) {
    setTag(preset.tag);
    setDescription(intl.formatMessage(preset.description));
    setCommand(preset.command);
  }

  // we keep the command in local storage, such that it does not vanish if the bar changes, we switch frame, etc.
  // This is specific to the project, file and frame editor type
  const lsKey = `AI:${project_id}:${path}:${type}`;

  function restoreCommand() {
    setCommand(LS.get(lsKey) ?? "");
  }

  function setCommand(command: string) {
    setCommandVal(command);
    if (command) {
      LS.set(lsKey, command);
    } else {
      // empty string
      LS.del(lsKey);
    }
  }

  useEffect(() => {
    if (showDialog) {
      setScope(getScope(id, actions));
      restoreCommand();
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [showDialog]);

  useEffect(() => {
    if (showDialog && scope && actions != null && !noContext) {
      const c = actions.languageModelGetContext(id, scope);
      setContext(c);
    }
  }, [showDialog, actions, scope]);

  const scopeOptions = useMemo(() => {
    const options: { label: string; value: Scope }[] = [];
    const available = actions.languageModelGetScopes();
    for (const value of available) {
      options.push({ label: capitalize(value), value });
    }
    options.push({ label: "All", value: "all" });
    options.push({ label: "None", value: "none" });
    if (scope != "all" && scope != "none" && !available.has(scope)) {
      setScope("all");
    }
    return options;
  }, [actions]);

  const doUpdateMessage = useDebouncedCallback(
    async () => {
      // don't waste time on update if it is not visible.
      if (!(visible && showDialog)) {
        return;
      }
      const { message, tokens, inputOriginalLen, inputTruncatedLen } =
        await updateMessage({
          actions,
          id,
          context,
          model,
          options: getQueryLLMOptions(),
        });

      setMessage(message);
      setTokens(tokens);

      if (tokens == 0 && message == "") {
        setTruncated(null);
        setTruncatedReason("");
        return;
      }

      setTruncated(
        Math.round(
          100 *
            (1 -
              (inputOriginalLen - inputTruncatedLen) /
                Math.max(1, inputOriginalLen)),
        ),
      );
      setTruncatedReason(
        `Input truncated from ${inputOriginalLen} to ${inputTruncatedLen} characters.${
          getMaxTokens(model) < 5000 // cutoff between GPT 3.5 and GPT 4
            ? "  Try using a different model with a bigger context size."
            : ""
        }`,
      );
    },
    500,
    { leading: true, trailing: true },
  );

  useAsyncEffect(doUpdateMessage, [
    id,
    scope,
    model,
    visible,
    showDialog,
    tag,
    command,
  ]);

  // END OF HOOKS

  if (
    !redux
      .getStore("projects")
      .hasLanguageModelEnabled(project_id, AI_ASSIST_TAG)
  ) {
    return null;
  }

  const queryLLM = async (options: Options) => {
    setError("");
    try {
      setQuerying(true);
      // this runs context through the truncation + message creation, and then sends it to chat
      await actions.languageModel(id, options, context);
      setCommand("");
    } catch (err) {
      setError(`${err}`);
    } finally {
      setQuerying(false);
    }
  };

  const doIt = async () => {
    setShowPreview(false);
    const options = getQueryLLMOptions();
    if (options == null) {
      return;
    }

    // Add prompt to history
    addPrompt(command);

    await queryLLM(options);
    setShowDialog(false);
    setError("");
    actions.focus();
  };

  function getQueryLLMOptions(): Options | null {
    if (command.trim()) {
      return {
        command: command.trim(),
        codegen: false,
        allowEmpty: true,
        model,
        tag: "custom",
      };
    } else {
      for (const preset of PRESETS) {
        if (preset.tag === tag) {
          return { ...preset, model };
        }
      }
    }
    return null;
  }

  function renderTitle() {
    return (
      <div>
        <Button
          onClick={() => {
            setShowDialog(false);
            setError("");
            actions.focus();
          }}
          type="text"
          style={{ float: "right", color: COLORS.GRAY_M }}
        >
          <Icon name="times" />
        </Button>
        <div style={{ float: "right" }}>
          <TitleBarButtonTour
            describeRef={describeRef}
            buttonsRef={examplesRef}
            scopeRef={scopeRef}
            contextRef={contextRef}
            submitRef={submitRef}
          />
        </div>
        <Title level={4}>
          <AIAvatar size={22} /> {intl.formatMessage(labels.assistant)}
        </Title>
        Select model:{" "}
        <LLMSelector
          project_id={project_id}
          model={model}
          setModel={setModel}
        />
      </div>
    );
  }

  function renderOptions() {
    if (!showOptions) return;

    const items: MenuProps["items"] = PRESETS.map((preset, idx) => {
      const { label, icon, description } = preset;

      return {
        key: `${idx}`,
        icon: <Icon name={icon} />,
        label: (
          <>
            <Text strong style={{ marginRight: "5px" }}>
              {intl.formatMessage(label)}:
            </Text>{" "}
            <Text type="secondary">{intl.formatMessage(description)}</Text>
          </>
        ),
        onClick: () => {
          setPreset(preset);
          track(TAG_TMPL, { project_id, template: intl.formatMessage(label) });
        },
      };
    });

    return (
      <>
        <Paragraph ref={examplesRef}>
          <Dropdown
            menu={{ items, style: { maxHeight: "50vh", overflow: "auto" } }}
            trigger={["click"]}
          >
            <Button style={{ width: "100%" }}>
              <Space>
                <Icon name="magic" />
                Pick an example
                <Icon name="caret-down" />
              </Space>
            </Button>
          </Dropdown>
        </Paragraph>
      </>
    );
  }

  function renderShowOptions() {
    if (!showOptions || noContext) {
      return;
    }

    return (
      <Paragraph
        style={{
          color: COLORS.GRAY_D,
          maxHeight: "max(20rem, 30vh)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: "5px" }} ref={scopeRef}>
          {truncated != null ? (
            truncated < 100 ? (
              <Tooltip title={truncatedReason}>
                <div style={{ float: "right" }}>
                  Truncated ({truncated}% remains)
                </div>
              </Tooltip>
            ) : (
              <div style={{ float: "right" }}>
                NOT Truncated (100% included)
              </div>
            )
          ) : undefined}
          {modelToName(model)} will see:
          <Radio.Group
            size="small"
            style={{ margin: "0 10px" }}
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
            }}
            options={scopeOptions}
            optionType="button"
            buttonStyle="solid"
          />
          <Button size="small" type="text" onClick={doUpdateMessage}>
            <Icon name="refresh" /> Update
          </Button>
        </div>
        <div ref={contextRef} style={{ overflowY: "auto" }}>
          <Context value={context} info={actions.languageModelGetLanguage()} />
        </div>
      </Paragraph>
    );
  }

  function renderCostEstimation() {
    if (!is_cocalc_com || tokens === 0) return;
    return (
      <div style={{ textAlign: "center" }}>
        <LLMCostEstimation model={model} tokens={tokens} type="secondary" />
      </div>
    );
  }

  function renderSubmit() {
    const btnTxt = `Ask ${modelToName(model)}`;
    return (
      <Paragraph style={{ textAlign: "center" }} ref={submitRef}>
        <Space size="middle">
          <Button
            size="large"
            onClick={() => {
              setShowDialog(false);
            }}
          >
            {intl.formatMessage(labels.cancel)}
          </Button>
          <Popover
            trigger={["click"]}
            title={
              <div style={{ maxWidth: "50vw" }}>
                <Button
                  onClick={() => {
                    setShowPreview(false);
                  }}
                  type="text"
                  style={{ float: "right", color: COLORS.GRAY_M }}
                >
                  <Icon name="times" />
                </Button>
                This will be sent to the language model
              </div>
            }
            open={showPreview && visible && showDialog}
            onOpenChange={(visible) => {
              if (!visible) {
                setShowPreview(visible);
              }
            }}
            content={() => (
              <Space direction="vertical" style={{ maxWidth: "50vw" }}>
                <StaticMarkdown
                  value={message}
                  style={{
                    maxHeight: "30vh",
                    overflow: "auto",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    color: COLORS.GRAY,
                  }}
                />
              </Space>
            )}
          >
            <BSButton
              disabled={message.length === 0 || querying || !command.trim()}
              bsSize="large"
              onClick={() => setShowPreview(!showPreview)}
              active={showPreview}
            >
              Preview
            </BSButton>
          </Popover>
          <Button
            disabled={querying || (!tag && !command.trim()) || !message}
            type="primary"
            size="large"
            onClick={doIt}
          >
            <Icon name={querying ? "spinner" : "paper-plane"} spin={querying} />{" "}
            {btnTxt} (shift+enter)
          </Button>
        </Space>
      </Paragraph>
    );
  }

  function renderContent() {
    return (
      <Space direction="vertical" style={{ width: "800px", maxWidth: "50vw" }}>
        <Paragraph>
          Describe what you want the language model{" "}
          <LLMNameLink model={model} /> to do. Be specific!
        </Paragraph>
        <Paragraph ref={describeRef}>
          <Space.Compact
            style={{ width: "100%", display: "flex", alignItems: "stretch" }}
          >
            <Input.TextArea
              ref={inputRef}
              allowClear
              autoFocus
              style={{ flex: 1 }}
              placeholder={"What should the language model do..."}
              value={command}
              onChange={(e) => {
                setCommand(e.target.value);
                setTag("");
                if (e.target.value) {
                  setDescription(getCustomDescription(frameType));
                } else {
                  setDescription("");
                }
              }}
              onPressEnter={(e) => {
                if (e.shiftKey) {
                  doIt();
                }
              }}
              autoSize={{ minRows: 2, maxRows: 10 }}
            />
            <LLMHistorySelector
              prompts={historyPrompts}
              onSelect={setCommand}
              disabled={querying}
              alignSelf="stretch"
            />
          </Space.Compact>
        </Paragraph>
        {renderOptions()}
        {renderShowOptions()}
        {!isChatPath(path) && (
          <Paragraph type="secondary">
            {description} The output will appear in the side chat, so your file
            isn't directly modified.
          </Paragraph>
        )}
        {renderSubmit()}
        {error ? (
          <Alert type="error" message={error} />
        ) : (
          renderCostEstimation()
        )}
      </Space>
    );
  }

  return (
    <Popover
      placement={
        "right" /* Otherwise this thing gets stuck on the left side of the screen, which is very disconcerting*/
      }
      title={renderTitle()}
      open={visible && showDialog}
      content={renderContent}
      trigger={["click"]}
      onOpenChange={(visible) => {
        if (!visible) {
          // otherwise, clicking outside the dialog to close it, does not close it
          // this is particularly bad if the dialog is larger than the viewport
          setShowDialog(visible);
          setShowPreview(visible);
        }
      }}
    >
      <Button
        style={buttonStyle}
        size={buttonSize}
        onClick={() => {
          setError("");
          setShowDialog(!showDialog);
          actions.blur();
        }}
      >
        <span ref={buttonRef}>
          <AIAvatar
            size={16}
            iconColor={COLORS.AI_ASSISTANT_TXT}
            innerStyle={{ top: "2px" }}
          />
          {noLabel ? (
            ""
          ) : (
            <VisibleMDLG>
              <span style={{ marginLeft: "5px" }}>
                {intl.formatMessage(labels.assistant)}
              </span>
            </VisibleMDLG>
          )}
        </span>
      </Button>
    </Popover>
  );
}

async function updateMessage({
  actions,
  id,
  context,
  model,
  options,
}: {
  actions: Actions;
  id: string;
  context: string;
  model: LanguageModel;
  options: Options | null;
}): Promise<{
  message: string;
  tokens: number;
  inputOriginalLen: number;
  inputTruncatedLen: number;
}> {
  if (options == null) {
    return {
      message: "",
      tokens: 0,
      inputOriginalLen: 0,
      inputTruncatedLen: 0,
    };
  }

  // construct the message (message.input is the maybe truncated input)
  const { message, inputOriginalLen, inputTruncatedLen } =
    await createChatMessage(actions, id, options, context);

  // compute the number of tokens (this MUST be a lazy import):
  const { getMaxTokens, numTokensUpperBound } = await import(
    "@cocalc/frontend/misc/llm"
  );

  const tokens = numTokensUpperBound(message, getMaxTokens(model));
  return { message, tokens, inputOriginalLen, inputTruncatedLen };
}

function getScope(id: string, actions: Actions): Scope {
  const scopes = actions.languageModelGetScopes();
  // don't know: selection if something is selected; otherwise,
  // fallback below.
  if (
    scopes.has("selection") &&
    actions.languageModelGetContext(id, "selection")?.trim()
  ) {
    return "selection";
  }
  if (scopes.has("page")) return "page";
  if (scopes.has("cell")) return "cell";
  return "all";
}
