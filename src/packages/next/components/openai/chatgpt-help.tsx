import { Button, Alert, Input, Row, Col } from "antd";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import { CSSProperties, useRef, useState } from "react";
import apiPost from "lib/api/post";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { useCustomize } from "lib/customize";
import Loading from "components/share/loading";
import A from "components/misc/A";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import { FileContext } from "@cocalc/frontend/lib/file-context";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import { useRouter } from "next/router";

type State = "input" | "wait";

const PROMPT = [
  "ASSUME I HAVE FULL ACCESS TO COCALC.", // otherwise it says things like "as a large language model I don't have access to cocalc."
  "ENCLOSE MATH IN $.", // so math gets typeset nicely
  "INCLUDE THE LANGUAGE DIRECTLY AFTER THE TRIPLE BACKTICKS IN ALL MARKDOWN CODE BLOCKS.", // otherwise often we can't evaluate code.
  "BE BRIEF.", // since it's slow.
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
  const router = useRouter();

  const counterRef = useRef<number>(0);
  const { account, jupyterApiEnabled, siteName } = useCustomize();

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
      <Row style={{ margin: "5px 0", ...style }}>
        <Col
          xs={{ span: 24 }}
          md={{ span: 17 }}
          style={{ marginBottom: "5px" }}
        >
          <Input.TextArea
            value={input}
            maxLength={account?.account_id == null ? 10 : 2000}
            onChange={(e) => setInput(e.target.value)}
            size={size}
            autoSize={{ minRows: focus ? 2 : 1, maxRows: 5 }}
            disabled={state == "wait"}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder={
              placeholder ?? `Ask ChatGPT: how can I do this on ${siteName}?`
            }
            allowClear
            onPressEnter={(e) => {
              if (e.shiftKey) {
                chatgpt();
              }
            }}
          />
          {input.trim() && account?.account_id == null && (
            <InPlaceSignInOrUp
              title="ChatGPT"
              why={"to use ChatGPT on " + siteName}
              onSuccess={() => {
                router.reload();
              }}
            />
          )}
        </Col>
        <Col
          xs={{ span: 24, offset: 0 }}
          md={{ span: 6, offset: 1 }}
          style={{
            marginBottom: "5px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Button
            disabled={account?.account_id == null}
            size={size}
            type="primary"
            onClick={() => {
              if (input?.trim()) {
                chatgpt();
              }
            }}
          >
            <OpenAIAvatar
              size={size == "large" ? 24 : 18}
              backgroundColor="transparent"
              style={{ marginRight: "5px", marginTop: "-4px" }}
            />
            {input?.trim() && focus
              ? "Shift+Enter"
              : size == "large"
              ? "Ask ChatGPT"
              : "ChatGPT"}
          </Button>
        </Col>
        <Col xs={{ span: 24 }} md={{ span: 24 }}>
          {error && (
            <Alert
              style={{ margin: "15px 0" }}
              type="error"
              message="Error"
              showIcon
              closable
              banner
              onClose={() => setError("")}
              description={
                <>
                  {error}
                  <hr />
                  OpenAI <A href="https://status.openai.com/">
                    status
                  </A> and{" "}
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
              banner
              onClose={() => setOutput("")}
              style={{ margin: "15px 0" }}
              description={
                <div>
                  <Markdown value={output} />
                </div>
              }
            />
          )}
        </Col>
      </Row>
    </FileContext.Provider>
  );
}
