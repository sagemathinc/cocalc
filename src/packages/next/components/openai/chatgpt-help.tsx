import { Button, Alert, Input } from "antd";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import { CSSProperties, useRef, useState } from "react";
import apiPost from "lib/api/post";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { useCustomize } from "lib/customize";
import Loading from "components/share/loading";
import { Icon } from "@cocalc/frontend/components/icon";

type State = "input" | "wait";

const PROMPT = [
  "ASSUME I HAVE FULL ACCESS TO COCALC.", // otherwise it says things like "as a large language model I don't have access to cocalc."
  "NEVER SAY WHAT THE OUTPUT OF A COMPUTATION WILL BE AND DO NOT COMMENT THAT THE OUTPUT IS OMITTED.", // frequently chatgpt makes idiotic claims about what running code will do; it's usually wrong.
  "How can I do the following using CoCalc?", // give the context of how the question the user asks should be answered.
].join(" ");

export default function ChatGPTHelp({ style }: { style?: CSSProperties }) {
  const [state, setState] = useState<State>("input");
  const [focus, setFocus] = useState<boolean>(false);
  const [output, setOutput] = useState<string | null>(null);
  const [input, setInput] = useState<string>("");
  const counterRef = useRef<number>(0);
  const { siteName } = useCustomize();

  const chatgpt = async (value?) => {
    if (value == null) {
      value = input;
    }
    if (!value.trim()) return;
    const message = `${PROMPT} ${value}`;
    const counter = counterRef.current + 1;
    try {
      counterRef.current += 1;
      setInput(value);
      setState("wait");
      const { output } = await apiPost("/openai/chatgpt", { input: message });
      if (counterRef.current != counter) return;
      setOutput(output);
    } finally {
      if (counterRef.current != counter) return;
      setState("input");
    }
  };

  return (
    <div style={style}>
      <Input.Search
        disabled={state == "wait"}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        placeholder={`What do you want to do using ${siteName}?`}
        allowClear
        enterButton={
          <>
            <OpenAIAvatar size={18} backgroundColor="transparent" />
            {!focus && <> Ask ChatGPT</>}
          </>
        }
        onSearch={chatgpt}
      />
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
        </div>
      )}
      {output != null && (
        <Alert
          type="success"
          closable
          onClose={() => setOutput("")}
          style={{ margin: "15px 0" }}
          message={input}
          description={
            <div>
              <Markdown value={output} />
              <Button
                onClick={() => {
                  chatgpt();
                }}
              >
                <Icon name="redo" /> Regenerate
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
}
