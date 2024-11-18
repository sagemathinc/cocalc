import { Alert, Button, Input, Space, Spin } from "antd";
import SelectUser from "./select-user";
import { useState } from "react";
import { redux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import type { Message } from "@cocalc/util/db-schema/messages";

export default function Compose({
  replyTo,
  onCancel,
  onSend,
  title,
  style,
}: {
  replyTo?: Message;
  onCancel?: Function;
  onSend?: Function;
  title?;
  style?;
}) {
  const [toId, setToId] = useState<string>(
    replyTo?.from_type == "account" ? replyTo.from_id : "",
  );
  const [subject, setSubject] = useState<string>(
    replyTo?.subject ? `Re: ${replyTo?.subject}` : "",
  );
  const [body, setBody] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [state, setState] = useState<"compose" | "sending" | "sent">("compose");

  const reset = () => {
    onCancel?.();
    setToId("");
    setSubject("");
    setBody("");
    setState("compose");
  };

  return (
    <div style={style}>
      <h3 style={{ marginBottom: "15px" }}>{title ?? "Compose Message"}</h3>
      <Space direction="vertical" style={{ width: "100%" }}>
        <div>
          <SelectUser
            defaultValue={
              replyTo?.from_type == "account" ? replyTo.from_id : ""
            }
            disabled={state != "compose"}
            placeholder="To..."
            style={{ width: "250px" }}
            onChange={setToId}
          />
        </div>
        <Input
          disabled={state != "compose"}
          placeholder="Subject..."
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <Input.TextArea
          autoFocus={replyTo != null}
          disabled={state != "compose"}
          rows={10}
          placeholder="Body..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div>
          <Space>
            <Button
              disabled={
                onCancel == null &&
                (state != "compose" ||
                  (subject == "" && toId == "" && body == ""))
              }
              onClick={() => reset()}
            >
              Cancel
            </Button>{" "}
            <Button
              disabled={
                !subject.trim() || !body.trim() || !toId || state != "compose"
              }
              type="primary"
              onClick={async () => {
                try {
                  setError("");
                  setState("sending");
                  await redux.getActions("messages").send({
                    to_id: toId,
                    to_type: "account",
                    subject,
                    body,
                    thread_id: replyTo?.thread_id ?? replyTo?.id,
                  });
                  setState("sent");
                  onSend?.();
                } catch (err) {
                  setError(`${err}`);
                  setState("compose");
                }
              }}
            >
              <Icon name="paper-plane" />{" "}
              {state == "sending" && (
                <>
                  Sending <Spin />
                </>
              )}
              {state == "compose" && <>Send</>}
              {state == "sent" && <>Sent</>}
            </Button>
          </Space>
        </div>
        {state == "sent" && (
          <Alert
            style={{ maxWidth: "500px" }}
            type="success"
            message={
              <>
                Message sent!{" "}
                <Button
                  onClick={() => {
                    reset();
                  }}
                >
                  Compose Another Message
                </Button>
              </>
            }
          />
        )}
        <ShowError
          error={error}
          setError={setError}
          style={{ margin: "30px auto" }}
        />
        {!!body?.trim() && (
          <div
            style={{
              margin: "30px",
              paddingTop: "15px",
              borderTop: "1px solid #ccc",
            }}
          >
            Preview:
            <br />
            <br />
            <StaticMarkdown value={body} />
          </div>
        )}
      </Space>
    </div>
  );
}
