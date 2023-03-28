/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A ChatGPT component that allows users to interact with OpenAI's language model
for several text and code related function.  This calls the chatgpt actions
to do the work.
*/

import { Alert, Button, Input, Popover, Space, Tooltip } from "antd";
import { useState } from "react";

import { Icon, VisibleMDLG } from "@cocalc/frontend/components";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";

interface Props {
  id: string;
  actions;
  ButtonComponent;
  buttonSize;
  buttonStyle;
  labels?: boolean;
  visible?: boolean;
}

const actionStyle = { width: "100%" };

export default function ChatGPT({
  id,
  actions,
  ButtonComponent,
  buttonSize,
  buttonStyle,
  labels,
  visible,
}: Props) {
  const [showChatGPT, setShowChatGPT] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [generic, setGeneric] = useState<string>("");

  const chatgpt = async (options) => {
    setError("");
    setGeneric("");
    try {
      await actions.chatgpt(id, options);
    } catch (err) {
      setError(`${err}`);
    }
  };

  return (
    <Popover
      title={
        <div style={{ fontSize: "18px" }}>
          <OpenAIAvatar size={24} style={{ marginRight: "5px" }} /> ChatGPT
          <Button
            onClick={() => {
              setShowChatGPT(false);
              setError("");
            }}
            type="text"
            style={{ float: "right", color: "#666" }}
          >
            <Icon name="times" />
          </Button>
        </div>
      }
      open={visible && showChatGPT}
      content={() => {
        return (
          <Space direction="vertical" style={{ width: "300px" }}>
            What would you like ChatGPT to do?
            <Button
              style={actionStyle}
              onClick={() => chatgpt({ command: "Complete ", codegen: true })}
            >
              <Icon name="pen" />
              Autocomplete
            </Button>
            <Button
              style={actionStyle}
              onClick={() =>
                chatgpt({ command: "fix all errors in ", codegen: true })
              }
            >
              <Icon name="bug" />
              Help me fix errors
            </Button>
            <div style={{ display: "flex" }}>
              <Button
                style={actionStyle}
                onClick={() => chatgpt({ command: "explain", codegen: false })}
              >
                <Icon name="bullhorn" />
                Explain
              </Button>
              <div style={{ width: "15px" }} />
              <Button
                style={actionStyle}
                onClick={() =>
                  chatgpt({ command: "add comments to", codegen: true })
                }
              >
                <Icon name="comment" />
                Add Comments
              </Button>
            </div>
            <div style={{ display: "flex" }}>
              <Button
                onClick={() => chatgpt({ command: "summarize" })}
                style={actionStyle}
              >
                <Icon name="bolt" />
                Summarize
              </Button>
              <div style={{ width: "15px" }} />
              <Button
                onClick={() =>
                  chatgpt({ command: "summarize in one sentence" })
                }
                style={actionStyle}
              >
                <Icon name="dot-circle" />
                Short Summary
              </Button>
            </div>
            <Button
              style={actionStyle}
              onClick={() =>
                chatgpt({
                  command:
                    "review for quality and correctness and suggest improvements",
                  codegen: false,
                })
              }
            >
              <Icon name="graduation-cap" />
              Quality Review
            </Button>
            <div style={{ marginLeft: "15px" }}>
              Ask ChatGPT to do anything:
              <Input.TextArea
                style={{ marginTop: "5px" }}
                rows={3}
                placeholder="Translate to Python, draw a plot, write a song..."
                value={generic}
                onChange={(e) => setGeneric(e.target.value)}
              />
              {generic.trim() && (
                <Button
                  type="primary"
                  style={{ marginTop: "5px" }}
                  onClick={() =>
                    chatgpt({
                      command: generic,
                      codegen: false,
                      allowEmpty: true,
                    })
                  }
                >
                  Do It
                </Button>
              )}
            </div>
            {error && <Alert type="error" message={error} />}
            <div
              style={{
                marginTop: "5px",
                paddingTop: "5px",
                borderTop: "1px solid #eee",
                color: "#666",
                fontSize: "10pt",
              }}
            >
              Select text and ChatGPT will only look at the selection.
              Otherwise, it looks at the current cell or first few thousand
              words of your file.
            </div>
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
