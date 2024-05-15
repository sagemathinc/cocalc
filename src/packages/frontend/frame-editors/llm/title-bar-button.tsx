/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A Language Model component that allows users to interact with ChatGPT and other language models.
for several text and code related function.  This calls the language model actions
to do the work.
*/

import { Alert, Button, Input, Popover, Radio, Space, Tooltip } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import {
  CSS,
  useAsyncEffect,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Icon,
  IconName,
  Paragraph,
  Title,
  VisibleMDLG,
} from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { LanguageModel, getMaxTokens } from "@cocalc/util/db-schema/llm-utils";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Actions } from "../code-editor/actions";
import Context from "./context";
import { Options, createChatMessage } from "./create-chat";
import LLMSelector, { modelToName } from "./llm-selector";
import TitleBarButtonTour from "./title-bar-button-tour";
import type { Scope } from "./types";

interface Preset {
  command: string;
  codegen: boolean;
  tag: string;
  icon: IconName;
  label: string;
  description: string;
}

const PRESETS: Readonly<Readonly<Preset>[]> = [
  {
    command: "Fix all errors in",
    codegen: true,
    tag: "fix-errors",
    icon: "bug",
    label: "Fix Errors",
    description: "Explain how to fix any mistakes it can find.",
  },
  {
    command: "Finish writing this",
    codegen: true,
    tag: "complete",
    icon: "pen",
    label: "Autocomplete",
    description:
      "Finish writing this. Language models can automatically write code, finish a poem, and much more.  The output is in chat so your file isn't directly modified.",
  },
  {
    command: "Explain in detail how this code works",
    codegen: false,
    tag: "explain",
    icon: "bullhorn",
    label: "Explain",
    description:
      "Explains this in detail. For example, you can select some code and will try to explain line by line how it works.",
  },
  {
    command: "Review for quality and correctness and suggest improvements",
    codegen: false,
    tag: "review",
    icon: "eye",
    label: "Review",
    description:
      "Review this for correctness and quality and suggest improvements.",
  },
  {
    command: "Add comments to",
    codegen: true,
    tag: "comment",
    icon: "comment",
    label: "Add Comments",
    description:
      "Tell you how to add comments so this is easier to understand.",
  },
  {
    command: "Summarize",
    codegen: false,
    tag: "summarize",
    icon: "bolt",
    label: "Summarize",
    description: "Write a summary of this.",
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
  const is_cocalc_com = useTypedRedux("customize", "is_cocalc_com");
  const [error, setError] = useState<string>("");
  const [custom, setCustom] = useState<string>("");
  const frameType = actions._get_frame_type(id);
  const [querying, setQuerying] = useState<boolean>(false);
  const [tag, setTag] = useState<string>("");
  const showOptions = frameType != "terminal";
  const [input, setInput] = useState<string>("");
  const [truncated, setTruncated] = useState<number>(0);
  const [truncatedReason, setTruncatedReason] = useState<string>("");
  const [scope, setScope] = useState<Scope>(() =>
    showDialog ? getScope(id, actions) : "all",
  );
  const [tokens, setTokens] = useState<number>(0);
  const [description, setDescription] = useState<string>(
    showOptions ? "" : getCustomDescription(frameType),
  );

  const describeRef = useRef<any>(null);
  const buttonsRef = useRef<any>(null);
  const scopeRef = useRef<any>(null);
  const contextRef = useRef<any>(null);
  const submitRef = useRef<any>(null);

  const [model, setModel] = useLanguageModelSetting(project_id);

  function setPreset(preset: Preset) {
    setTag(preset.tag);
    setDescription(preset.description);
    setCustom(preset.command);
  }

  useEffect(() => {
    if (showDialog) {
      if (showOptions && !description) {
        setPreset(PRESETS[0]);
      }
      setScope(getScope(id, actions));
    }
  }, [showDialog]);

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

  async function doUpdateInput() {
    if (!(visible && showDialog)) {
      // don't waste time on update if it is not visible.
      return;
    }
    const {
      input: inputNext,
      inputOrig,
      tokens,
    } = await updateInput(actions, id, scope, model, getQueryLLMOptions());
    setTokens(tokens);
    setInput(inputNext);
    setTruncated(
      Math.round(
        100 *
          (1 -
            (inputOrig.length - inputNext.length) /
              Math.max(1, inputOrig.length)),
      ),
    );
    setTruncatedReason(
      `Input truncated from ${inputOrig.length} to ${
        inputNext.length
      } characters.${
        getMaxTokens(model) < 5000 // cutoff between GPT 3.5 and GPT 4
          ? "  Try using a different model with a bigger context size."
          : ""
      }`,
    );
  }

  useAsyncEffect(async () => {
    await doUpdateInput();
  }, [id, scope, model, visible, showDialog, tag, custom]);

  const queryLLM = async (options: Options) => {
    setError("");
    try {
      setQuerying(true);
      await actions.languageModel(id, options, input);
      setCustom("");
    } catch (err) {
      setError(`${err}`);
    } finally {
      setQuerying(false);
    }
  };

  const doIt = async () => {
    const options = getQueryLLMOptions();
    if (options == null) return;
    await queryLLM(options);
    setShowDialog(false);
    setError("");
    actions.focus();
  };

  function getQueryLLMOptions(): Options | null {
    if (custom.trim()) {
      return {
        command: custom.trim(),
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
      <div style={{ fontSize: "18px" }}>
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
            buttonsRef={buttonsRef}
            scopeRef={scopeRef}
            contextRef={contextRef}
            submitRef={submitRef}
          />
        </div>
        <Title level={4}>
          <AIAvatar size={22} /> What would you like to do using{" "}
          {modelToName(model)}?
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
    return (
      <>
        <div
          ref={buttonsRef}
          style={{ overflowX: "auto", textAlign: "center" }}
        >
          or{" "}
          <Button.Group style={{ marginLeft: "5px" }}>
            {PRESETS.map((preset) => (
              <Button
                type={preset.tag == tag ? "primary" : undefined}
                key={preset.tag}
                onClick={() => {
                  setPreset(preset);
                }}
                disabled={querying}
              >
                <Icon name={preset.icon} />
                {preset.label}
              </Button>
            ))}
          </Button.Group>
        </div>
      </>
    );
  }

  function renderShowOptions() {
    if (!showOptions) return;

    return (
      <div
        style={{
          marginTop: "5px",
          color: COLORS.GRAY_D,
          maxHeight: "40vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: "5px" }} ref={scopeRef}>
          {truncated < 100 ? (
            <Tooltip title={truncatedReason}>
              <div style={{ float: "right" }}>
                Truncated ({truncated}% remains)
              </div>
            </Tooltip>
          ) : (
            <div style={{ float: "right" }}>NOT Truncated (100% included)</div>
          )}
          {modelToName(model)} will see:
          <Radio.Group
            size="small"
            style={{ margin: "0 10px" }}
            value={scope}
            onChange={(e) => {
              const scope = e.target.value;
              setScope(scope);
            }}
            options={scopeOptions}
            optionType="button"
            buttonStyle="solid"
          />
          <Button size="small" type="text" onClick={doUpdateInput}>
            <Icon name="refresh" /> Update
          </Button>
        </div>
        <div ref={contextRef} style={{ overflowY: "auto" }}>
          {custom != "" ? (
            <Context value={input} info={actions.languageModelGetLanguage()} />
          ) : undefined}
        </div>
      </div>
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

  function renderContent() {
    return (
      <Space direction="vertical" style={{ width: "800px", maxWidth: "90vw" }}>
        <Paragraph ref={describeRef}>
          <Input.TextArea
            allowClear
            autoFocus
            style={{ flex: 1 }}
            placeholder={"What do you want to do..."}
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
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
        </Paragraph>
        {renderOptions()}
        {renderShowOptions()}
        <Paragraph>{description}</Paragraph>
        {renderCostEstimation()}
        <Paragraph style={{ textAlign: "center" }} ref={submitRef}>
          <Button
            disabled={querying || (!tag && !custom.trim())}
            type="primary"
            size="large"
            onClick={doIt}
          >
            <Icon name={querying ? "spinner" : "paper-plane"} spin={querying} />{" "}
            Ask {modelToName(model)} (shift+enter)
          </Button>
        </Paragraph>
        {error ? <Alert type="error" message={error} /> : undefined}
      </Space>
    );
  }

  return (
    <Popover
      title={renderTitle()}
      open={visible && showDialog}
      content={renderContent}
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
            size={18}
            iconColor={COLORS.AI_ASSISTANT_TXT}
            style={{ top: "-2px", marginRight: "1px" }}
          />
          {noLabel ? (
            ""
          ) : (
            <VisibleMDLG>
              <span style={{ marginLeft: "5px" }}>Assistant</span>
            </VisibleMDLG>
          )}
        </span>
      </Button>
    </Popover>
  );
}

async function updateInput(
  actions: Actions,
  id: string,
  scope: Scope,
  model: LanguageModel,
  options: Options | null,
): Promise<{ input: string; inputOrig: string; tokens: number }> {
  if (options == null || scope === "none") {
    return { input: "", inputOrig: "", tokens: 0 };
  }
  let input = actions.languageModelGetContext(id, scope);
  const inputOrig = input;

  // construct the message (message.input is the maybe truncated input)
  const message = await createChatMessage(actions, id, options, input);

  // compute the number of tokens (this MUST be a lazy import):
  const { getMaxTokens, numTokensUpperBound } = await import(
    "@cocalc/frontend/misc/llm"
  );

  const tokens = numTokensUpperBound(message.message, getMaxTokens(model));
  return { input: message.input, inputOrig, tokens };
}

function getScope(id, actions: Actions): Scope {
  const scopes = actions.languageModelGetScopes();
  // don't know: selection if something is selected; otherwise,
  // ballback below.
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
