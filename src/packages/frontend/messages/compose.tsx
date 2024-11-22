import { Alert, Button, Divider, Input, Modal, Space, Spin } from "antd";
import SelectUser from "./select-user";
import { useState } from "react";
import { redux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import type { Message } from "@cocalc/util/db-schema/messages";
import { isFromMe } from "./util";
import User from "./user";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";

export default function Compose({
  replyTo,
  onCancel,
  onSend,
  style,
}: {
  replyTo?: Message;
  onCancel?: Function;
  onSend?: Function;
  style?;
}) {
  // [ ] todo type != 'account' for destination!
  const [toId, setToId] = useState<string>(
    isFromMe(replyTo)
      ? (replyTo?.to_id ?? "")
      : replyTo?.from_type == "account"
        ? replyTo.from_id
        : "",
  );
  const [subject, setSubject] = useState<string>(
    replySubject(replyTo?.subject),
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
    <Space direction="vertical" style={{ width: "100%", ...style }}>
      {replyTo == null && (
        <div>
          <SelectUser
            autoFocus
            disabled={state != "compose"}
            placeholder="To..."
            style={{ width: "250px" }}
            onChange={setToId}
          />
        </div>
      )}
      {replyTo != null && toId != null && (
        <div>
          <User id={toId} type="account" show_avatar />
        </div>
      )}
      <Input
        disabled={state != "compose"}
        placeholder="Subject..."
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      {state != "compose" && <StaticMarkdown value={body} />}
      {state == "compose" && (
        <MarkdownInput
          value={body}
          onChange={setBody}
          placeholder="Body..."
          autoFocus={replyTo != null}
          style={{ minHeight: "200px" }}
        />
      )}
      <div>
        <Divider />
        <Space>
          <Button
            size="large"
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
            size="large"
            disabled={!subject.trim() || !toId || state != "compose"}
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
                  thread_id: getThreadId({ replyTo, subject }),
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
  );
}

export function ComposeButton(props) {
  const [open, setOpen] = useState<boolean>(false);
  const close = () => setOpen(false);

  return (
    <>
      <Button {...props} onClick={() => setOpen(true)}>
        <Icon name="pencil" /> Compose
      </Button>
      {open && (
        <Modal
          open
          styles={{ content: { maxWidth: "1000px", margin: "auto" } }}
          width={"85%"}
          onCancel={close}
          onOk={close}
          footer={[]}
        >
          <Compose onSend={close} onCancel={close} />
        </Modal>
      )}
    </>
  );
}

function replySubject(subject) {
  if (!subject?.trim()) {
    return "";
  }
  if (subject.toLowerCase().startsWith("re:")) {
    return subject;
  }
  return `Re: ${subject}`;
}

// If user explicitly edits the thread in any way,
// then reply starts a new thread (matching gmail behavior).
function getThreadId({ replyTo, subject }) {
  if (replyTo == null) {
    return undefined;
  }
  if (subject.trim() == replySubject(replyTo?.subject)) {
    return replyTo?.thread_id ?? replyTo?.id;
  }
  return undefined;
}
