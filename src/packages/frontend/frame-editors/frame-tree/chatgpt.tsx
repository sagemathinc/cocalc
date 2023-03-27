import { Alert, Popover, Space, Button, Input } from "antd";

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
          <Space direction="vertical" style={{ width: "400px" }}>
            What would you like ChatGPT to do with the selection?
            <Button
              size="large"
              type="text"
              onClick={() => chatgpt({ command: "very short summarize" })}
            >
              Short Summary
            </Button>
            <Button
              size="large"
              type="text"
              onClick={() => chatgpt({ command: "summarize" })}
            >
              Summarize
            </Button>
            <Button
              size="large"
              type="text"
              onClick={() =>
                chatgpt({ command: "fix all syntax errors in ", codegen: true })
              }
            >
              Fix Syntax Errors
            </Button>
            <Button
              size="large"
              type="text"
              onClick={() =>
                chatgpt({ command: "add comments to", codegen: true })
              }
            >
              Add Comments
            </Button>
            <Button
              size="large"
              type="text"
              onClick={() => chatgpt({ command: "Complete ", codegen: true })}
            >
              Guess what comes next
            </Button>
            <Input.TextArea
              placeholder="Describe anything else you can possibly imagine..."
              value={generic}
              onChange={(e) => setGeneric(e.target.value)}
            />
            {generic.trim() && (
              <Button
                size="large"
                onClick={() => chatgpt({ command: generic, codegen: true })}
              >
                Do It
              </Button>
            )}
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
        }}
      >
        <OpenAIAvatar size={20} style={{ marginTop: "-5px" }} />{" "}
        <VisibleMDLG>{labels ? "ChatGPT..." : undefined}</VisibleMDLG>
      </ButtonComponent>
    </Popover>
  );
}
