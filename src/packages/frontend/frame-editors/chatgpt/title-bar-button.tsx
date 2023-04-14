/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A ChatGPT component that allows users to interact with OpenAI's language model
for several text and code related function.  This calls the chatgpt actions
to do the work.
*/

import { Alert, Button, Input, Popover, Select, Space, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { Icon, IconName, VisibleMDLG } from "@cocalc/frontend/components";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import { COLORS } from "@cocalc/util/theme";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import infoToMode from "@cocalc/frontend/editors/slate/elements/code-block/info-to-mode";
import { filename_extension } from "@cocalc/util/misc";

interface Preset {
  command: string;
  codegen: boolean;
  tag: string;
  icon: IconName;
  label: string;
  description: string;
}

const PRESETS: Preset[] = [
  {
    command: "Complete",
    codegen: true,
    tag: "complete",
    icon: "pen",
    label: "Autocomplete",
    description:
      "Finish writing the contents of the selection. ChatGPT can automatically write code, finish a poem, and much more.  The output is in chat so your file isn't directly modified.",
  },
  {
    command: "fix all errors in",
    codegen: true,
    tag: "fix-errors",
    icon: "bug",
    label: "Help me fix errors",
    description:
      "Try to understand your selection and explain how to fix any mistakes it can find.",
  },
  {
    command: "explain",
    codegen: false,
    tag: "explain",
    icon: "bullhorn",
    label: "Explain",
    description:
      "Explain your selection in detail. For example, you can select some code and will try to explain line by line how it works.",
  },
  {
    command: "add comments to",
    codegen: true,
    tag: "comment",
    icon: "comment",
    label: "Add Comments",
    description:
      "Tell you how to add comments to the selection so it is easier to understand.",
  },
  {
    command: "summarize",
    codegen: false,
    tag: "summarize",
    icon: "bolt",
    label: "Summarize",
    description: "Write a summary of the selected text or code.",
  },
  {
    command: "summarize in one sentence",
    codegen: false,
    tag: "summarize-short",
    icon: "dot-circle",
    label: "Short Summary",
    description:
      "Write a very short one sentence executive summary of the selected text or code.",
  },
  {
    command: "review for quality and correctness and suggest improvements",
    codegen: false,
    tag: "review",
    icon: "eye",
    label: "Quality Review",
    description:
      "Review the selected text or code for correctness and quality and suggest improvements.",
  },
];

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
};

function getCustomDescription(frameType) {
  return CUSTOM_DESCRIPTIONS[frameType] ?? CUSTOM_DESCRIPTIONS["generic"];
}

interface Props {
  id: string;
  actions;
  ButtonComponent;
  buttonSize;
  buttonStyle;
  labels?: boolean;
  visible?: boolean;
  path: string;
}

export default function ChatGPT({
  id,
  actions,
  ButtonComponent,
  buttonSize,
  buttonStyle,
  labels,
  visible,
  path,
}: Props) {
  const [showChatGPT, setShowChatGPT] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [custom, setCustom] = useState<string>("");
  const frameType = actions._get_frame_type(id);
  const [querying, setQuerying] = useState<boolean>(false);
  const [tag, setTag] = useState<string>("");
  const showOptions = frameType != "terminal";
  const [input, setInput] = useState<string>("");

  useEffect(() => {
    updateInput(actions, id, setInput);
  }, [id]);

  const [description, setDescription] = useState<string>(
    showOptions ? "" : getCustomDescription(frameType)
  );

  const chatgpt = async (options) => {
    // console.log("chatgpt", options);
    setError("");
    try {
      setQuerying(true);
      await actions.chatgpt(id, options, input);
      setCustom("");
    } catch (err) {
      setError(`${err}`);
    } finally {
      setQuerying(false);
    }
  };

  const doIt = () => {
    if (custom.trim()) {
      chatgpt({
        command: custom.trim(),
        codegen: false,
        allowEmpty: true,
        tag: "custom",
      });
      return;
    }
    for (const preset of PRESETS) {
      if (preset.tag == tag) {
        chatgpt(preset);
        break;
      }
    }
  };

  return (
    <Popover
      placement="rightBottom"
      title={
        <div style={{ fontSize: "18px" }}>
          <OpenAIAvatar size={24} style={{ marginRight: "5px" }} /> ChatGPT:
          What would you like to do?
          <Button
            onClick={() => {
              setShowChatGPT(false);
              setError("");
              actions.focus();
            }}
            type="text"
            style={{ float: "right", color: COLORS.GRAY_M }}
          >
            <Icon name="times" />
          </Button>
        </div>
      }
      open={visible && showChatGPT}
      content={() => {
        return (
          <Space
            direction="vertical"
            style={{ width: "800px", maxWidth: "100%" }}
          >
            <div style={{ display: "flex", width: "100%", marginTop: "5px" }}>
              <Input.TextArea
                allowClear
                autoFocus
                style={{ flex: 1 }}
                placeholder="Describe what you want ChatGPT to do..."
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
                autoSize={{ minRows: 2, maxRows: 6 }}
              />
              {showOptions && (
                <>
                  <div style={{ margin: "5px 5px 0 5px" }}>or</div>
                  <div style={{ height: "40px", flex: 0.5 }}>
                    <Select
                      showSearch
                      allowClear
                      placeholder="Choose..."
                      optionFilterProp="children"
                      filterOption={(input, option) => {
                        if (!option) return false;
                        const preset = option.preset;
                        return `${preset.command} ${preset.label} ${preset.description}`
                          .toLowerCase()
                          .includes(input.toLowerCase());
                      }}
                      style={{ width: "100%" }}
                      disabled={querying}
                      options={PRESETS.map((preset) => {
                        return {
                          label: (
                            <>
                              <Icon name={preset.icon} /> {preset.label}
                            </>
                          ),
                          value: preset.tag,
                          preset: preset,
                        };
                      })}
                      onChange={(tag) => {
                        setTag(tag);
                        if (!tag) {
                          setDescription("");
                        } else {
                          for (const x of PRESETS) {
                            if (x.tag == tag) {
                              setDescription(x.description);
                              setCustom("");
                              break;
                            }
                          }
                        }
                      }}
                      value={tag ? tag : undefined}
                    />
                  </div>
                </>
              )}
            </div>
            {showOptions && input && (
              <div
                style={{
                  marginTop: "5px",
                  color: "#444",
                }}
              >
                ChatGPT will see the following context, taken from your current
                selection, code cell or the first few thousand words of your
                file. To change this, close this dialog, select part of your
                file, then open the dialog again.
                <div style={{ height: "5px" }} />
                <CodeMirrorStatic
                  style={{
                    maxHeight: "100px",
                    overflowY: "auto",
                    margin: "5px",
                    padding: 0,
                    width: undefined,
                  }}
                  options={{
                    mode: path ? infoToMode(filename_extension(path)) : "",
                  }}
                  value={input}
                />
              </div>
            )}{" "}
            {description}
            <div style={{ textAlign: "center" }}>
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
                Ask ChatGPT (shift+enter)
              </Button>
            </div>
            {error && <Alert type="error" message={error} />}
          </Space>
        );
      }}
    >
      <ButtonComponent
        style={buttonStyle}
        bsSize={buttonSize}
        onClick={() => {
          setError("");
          setShowChatGPT(!showChatGPT);
          updateInput(actions, id, setInput);
          actions.blur();
        }}
      >
        <Tooltip title="Get assistance from ChatGPT">
          <OpenAIAvatar size={20} style={{ marginTop: "-5px" }} />{" "}
        </Tooltip>
        <VisibleMDLG>{labels ? "ChatGPT..." : undefined}</VisibleMDLG>
      </ButtonComponent>
    </Popover>
  );
}

async function updateInput(actions, id, setInput) {
  let input = actions.chatgptGetContext(id);
  if (input.length > 2000) {
    // Truncate input (also this MUST be a lazy import):
    const { truncateMessage, MAX_CHATGPT_TOKENS } = await import(
      "@cocalc/frontend/misc/openai"
    );
    const maxTokens = MAX_CHATGPT_TOKENS - 1000; // 1000 tokens reserved for output and the prompt below.
    input = truncateMessage(input, maxTokens);
  }
  setInput(input);
}
