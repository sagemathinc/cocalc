import { Button, Alert, Input } from "antd";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import { CSSProperties, useRef, useState } from "react";
import apiPost from "lib/api/post";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { useCustomize } from "lib/customize";
import Loading from "components/share/loading";
import A from "components/misc/A";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import { FileContext } from "@cocalc/frontend/lib/file-context";

type State = "input" | "wait";

const PROMPT = [
  "ASSUME I HAVE FULL ACCESS TO COCALC.", // otherwise it says things like "as a large language model I don't have access to cocalc."
  "ENCLOSE MATH IN $.", // so math gets typeset nicely
  "INCLUDE THE LANGUAGE DIRECTLY AFTER THE TRIPLE BACKTICKS IN ALL MARKDOWN CODE BLOCKS.", // otherwise often we can't evaluate code.
  "How can I do the following using CoCalc?", // give the context of how the question the user asks should be answered.
].join(" ");

export default function ChatGPTHelp({
  style,
  prompt,
  size,
  placeholder,
  tag = "",
}: {
  style?: CSSProperties;
  prompt?: string;
  size?;
  placeholder?: string;
  tag?: string;
}) {
  const [state, setState] = useState<State>("input");
  const [focus, setFocus] = useState<boolean>(false);
  const [output, setOutput] = useState<string | null>(null);
  const [input, setInput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const counterRef = useRef<number>(0);
  const { jupyterApiEnabled, siteName } = useCustomize();

  const chatgpt = async (value?) => {
    if (value == null) {
      value = input;
    }
    if (!value.trim()) return;
    const system = `${PROMPT} ${prompt ?? ""}`;
    const counter = counterRef.current + 1;
    try {
      counterRef.current += 1;
      setInput(value);
      setState("wait");
      let output;
      try {
        ({ output } = await apiPost("/openai/chatgpt", {
          input: value,
          system,
          tag: `next:${tag}`,
        }));
      } catch (err) {
        if (counterRef.current != counter) return;
        setError(`${err}`);
        return;
      }
      if (counterRef.current != counter) return;
      setOutput(output);
    } finally {
      if (counterRef.current != counter) return;
      setState("input");
    }
  };

  return (
    <FileContext.Provider value={{ jupyterApiEnabled }}>
      <div style={style}>
        <div style={{ width: "100%", display: "flex" }}>
          <Input.TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ flex: 1 }}
            size={size}
            autoSize={{ minRows: focus ? 2 : 1, maxRows: 5 }}
            disabled={state == "wait"}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder={
              placeholder ?? `What do you want to do on ${siteName}?`
            }
            allowClear
            onPressEnter={(e) => {
              if (e.shiftKey) {
                chatgpt();
              }
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              textAlign: "center",
            }}
          >
            <Button
              disabled={!input?.trim()}
              size={size}
              type="primary"
              style={{
                marginLeft: "5px",
                height: size == "large" ? "39px" : undefined,
              }}
              onClick={() => {
                chatgpt();
              }}
            >
              <OpenAIAvatar
                size={size == "large" ? 24 : 18}
                backgroundColor="transparent"
                style={{ marginRight: "5px", marginTop: "-4px" }}
              />
              Ask ChatGPT
            </Button>
            <span style={{ color: "#666" }}>
              {focus && input.trim() && "Shift + Enter"}
            </span>
          </div>
        </div>
        {error && (
          <Alert
            style={{ margin: "15px 0" }}
            type="error"
            message="Error"
            showIcon
            closable
            onClose={() => setError("")}
            description={
              <>
                {error}
                <hr />
                OpenAI <A href="https://status.openai.com/">status</A> and{" "}
                <A href="https://downdetector.com/status/openai/">
                  downdetector
                </A>
                .
              </>
            }
          />
        )}
        {state == "wait" && (
          <div style={{ textAlign: "center", margin: "15px 0" }}>
            <OpenAIAvatar size={18} /> ChatGPT is figuring out how to do this
            using {siteName}...{" "}
            <Button
              style={{ float: "right" }}
              onClick={() => {
                counterRef.current += 1; // so result of outstanding request is totally ignored
                setState("input");
              }}
            >
              <Loading delay={0}>Cancel...</Loading>
            </Button>
            <ProgressEstimate seconds={30} />
          </div>
        )}
        {output != null && (
          <Alert
            type="success"
            closable
            onClose={() => setOutput("")}
            style={{ margin: "15px 0" }}
            description={
              <div>
                <Markdown value={output} />
              </div>
            }
          />
        )}
      </div>
    </FileContext.Provider>
  );
}
