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
  Icon,
  IconName,
  Title,
  VisibleMDLG,
} from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { LanguageModelVendorAvatar } from "../../components/language-model-icon";
import { Actions } from "../code-editor/actions";
import Context from "./context";
import { Options } from "./create-chat";
import ModelSwitch, { LanguageModel, modelToName } from "./model-switch";
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
  buttonStyle;
  labels?: boolean;
  visible?: boolean;
  path: string;
  buttonRef;
  project_id: string;
}

export default function LanguageModelTitleBarButtonDialog({
  id,
  actions,
  buttonSize,
  buttonStyle,
  labels,
  visible,
  path,
  buttonRef,
  project_id,
}: Props) {
  const [showDialog, setShowDialog] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [custom, setCustom] = useState<string>("");
  const frameType = actions._get_frame_type(id);
  const [querying, setQuerying] = useState<boolean>(false);
  const [tag, setTag] = useState<string>("");
  const showOptions = frameType != "terminal";
  const [input, setInput] = useState<string>("");
  const [truncated, setTruncated] = useState<number>(0);
  const [truncatedReason, setTruncatedReason] = useState<string>("");
  const [scope, setScope] = useState<Scope | "all">(() =>
    showDialog ? getScope(id, actions) : "all",
  );
  const describeRef = useRef<any>(null);
  const buttonsRef = useRef<any>(null);
  const scopeRef = useRef<any>(null);
  const contextRef = useRef<any>(null);
  const submitRef = useRef<any>(null);
  const [model, setModel] = useLanguageModelSetting();

  useEffect(() => {
    if (showDialog) {
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

  const doUpdateInput = async () => {
    if (!(visible && showDialog)) {
      // don't waste time on update if it is not visible.
      return;
    }
    const { input, inputOrig } = await updateInput(actions, id, scope, model);
    setInput(input);
    setTruncated(
      Math.round(
        100 *
          (1 -
            (inputOrig.length - input.length) / Math.max(1, inputOrig.length)),
      ),
    );
    setTruncatedReason(
      `Input truncated from ${inputOrig.length} to ${input.length} characters.${
        model == "gpt-3.5-turbo"
          ? "  Try using a different model with a bigger context size."
          : ""
      }`,
    );
  };

  useEffect(() => {
    doUpdateInput();
  }, [id, scope, visible, path, showDialog, model]);

  const [description, setDescription] = useState<string>(
    showOptions ? "" : getCustomDescription(frameType),
  );

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

  const doIt = () => {
    if (custom.trim()) {
      queryLLM({
        command: custom.trim(),
        codegen: false,
        allowEmpty: true,
        model,
        tag: "custom",
      });
      return;
    }
    for (const preset of PRESETS) {
      if (preset.tag == tag) {
        queryLLM({ ...preset, model });
        break;
      }
    }
    setShowDialog(false);
    setError("");
    actions.focus();
  };

  return (
    <Popover
      title={
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
            <LanguageModelVendorAvatar model={model} /> What would you like to
            do using {modelToName(model)}?
          </Title>
          Switch model:{" "}
          <ModelSwitch
            project_id={project_id}
            size="small"
            model={model}
            setModel={setModel}
          />
        </div>
      }
      open={visible && showDialog}
      content={() => {
        return (
          <Space
            direction="vertical"
            style={{ width: "800px", maxWidth: "90vw" }}
          >
            <div ref={describeRef}>
              <Input.TextArea
                allowClear
                autoFocus
                style={{ flex: 1 }}
                placeholder={"What you want to do..."}
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
            </div>
            {showOptions && (
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
                          setTag(preset.tag);
                          setDescription(preset.description);
                          setCustom(preset.command);
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
            )}
            {showOptions && (
              <div
                style={{
                  marginTop: "5px",
                  color: "#444",
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
                    <div style={{ float: "right" }}>
                      NOT Truncated (100% included)
                    </div>
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
                  <Context
                    value={input}
                    info={actions.languageModelGetLanguage()}
                  />
                </div>
              </div>
            )}{" "}
            {description}
            <div style={{ textAlign: "center" }} ref={submitRef}>
              <Button
                disabled={querying || (!tag && !custom.trim())}
                type="primary"
                size="large"
                onClick={doIt}
              >
                <Icon
                  name={querying ? "spinner" : "paper-plane"}
                  spin={querying}
                />{" "}
                Ask {modelToName(model)} (shift+enter)
              </Button>
            </div>
            {error && <Alert type="error" message={error} />}
          </Space>
        );
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
          <Tooltip title="Get assistance from a language model">
            <AIAvatar
              size={20}
              iconColor="white"
              style={{ marginTop: "-5px" }}
              innerStyle={{}}
            />{" "}
          </Tooltip>
          <VisibleMDLG>{labels ? "Assist..." : undefined}</VisibleMDLG>
        </span>
      </Button>
    </Popover>
  );
}

async function updateInput(
  actions: Actions,
  id,
  scope,
  model: LanguageModel,
): Promise<{ input: string; inputOrig: string }> {
  if (scope == "none") {
    return { input: "", inputOrig: "" };
  }
  let input = actions.languageModelGetContext(id, scope);
  const inputOrig = input;
  if (input.length > 2000) {
    // Truncate input (also this MUST be a lazy import):
    const { truncateMessage, getMaxTokens } = await import(
      "@cocalc/frontend/misc/openai"
    );
    const maxTokens = getMaxTokens(model) - 1000; // 1000 tokens reserved for output and the prompt below.
    input = truncateMessage(input, maxTokens);
  }
  return { input, inputOrig };
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
