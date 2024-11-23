import { Alert, Button, Divider, Flex, Input, Modal, Space, Spin } from "antd";
import SelectUser from "./select-user";
import { useRef, useState } from "react";
import { redux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import type { Message } from "@cocalc/util/db-schema/messages";
import { isFromMe } from "./util";
import User from "./user";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { webapp_client } from "@cocalc/frontend/webapp-client";

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
  const draftId = useRef<number | null>(null);

  const [toType] = useState<string>(replyTo?.from_type ?? "account");
  // [ ] todo type != 'account' for destination!
  const [toId, setToId] = useState<string>(
    isFromMe(replyTo) ? (replyTo?.to_id ?? "") : (replyTo?.from_id ?? ""),
  );
  const [subject, setSubject] = useState<string>(
    replySubject(replyTo?.subject),
  );
  const [body, setBody] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [state, setState] = useState<"compose" | "saving" | "sending" | "sent">(
    "compose",
  );

  const reset = () => {
    onCancel?.();
    draftId.current = null;
    setToId("");
    setSubject("");
    setBody("");
    setState("compose");
  };

  const discardDraft = async () => {
    if (draftId.current == null) {
      return;
    }
    try {
      const actions = redux.getActions("messages");
      await actions.updateDraft({
        id: draftId.current,
        expire: webapp_client.server_time(),
        deleted: true,
      });
      draftId.current = null;
    } catch (_err) {}
  };

  const saveDraft = async ({ subject, body }) => {
    if (state != "compose") {
      return;
    }
    try {
      setError("");
      setState("saving");
      const actions = redux.getActions("messages");
      if (draftId.current == null) {
        draftId.current = await actions.createDraft({
          to_id: toId,
          to_type: toType,
          thread_id: getThreadId({ replyTo, subject }),
          subject,
          body,
        });
      } else {
        await actions.updateDraft({
          id: draftId.current,
          to_id: toId,
          to_type: toType,
          thread_id: getThreadId({ replyTo, subject }),
          subject,
          body,
        });
      }
    } catch (err) {
      setError(`${err}`);
    } finally {
      setState("compose");
    }
  };

  const send = async (body0?: string) => {
    try {
      setError("");
      setState("sending");
      const actions = redux.getActions("messages");
      if (draftId.current) {
        await actions.updateDraft({
          id: draftId.current,
          to_id: toId,
          to_type: toType,
          thread_id: getThreadId({ replyTo, subject }),
          subject,
          body: body ?? body,
          sent: webapp_client.server_time(),
        });
      } else {
        actions.send({
          to_id: toId,
          to_type: toType,
          subject,
          body: body0 ?? body,
          thread_id: getThreadId({ replyTo, subject }),
        });
      }
      setState("sent");
      onSend?.();
    } catch (err) {
      setError(`${err}`);
      setState("compose");
    }
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
        <div style={{ color: "#666" }}>
          to <User id={toId} type="account" show_avatar />
        </div>
      )}
      <Input
        disabled={state == "sending" || state == "sent"}
        placeholder="Subject..."
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      {state == "sending" ||
        (state == "sent" && <StaticMarkdown value={body} />)}
      {!(state == "sending" || state == "sent") && (
        <MarkdownInput
          value={body}
          onChange={(body) => {
            setBody(body);
            saveDraft({ body, subject });
          }}
          placeholder="Body..."
          autoFocus={replyTo != null}
          style={{ minHeight: "200px" }}
          onShiftEnter={(body) => {
            setBody(body);
            if (body.trim()) {
              send(body);
            }
          }}
        />
      )}
      <div>
        <Divider />
        <Flex>
          <Button
            size="large"
            disabled={
              !subject.trim() ||
              !toId ||
              state == "sending" ||
              state == "sent" ||
              state == "saving" ||
              (replyTo != null && !body.trim())
            }
            type="primary"
            onClick={() => send()}
          >
            <Icon name="paper-plane" />{" "}
            {state == "sending" && (
              <>
                Sending <Spin />
              </>
            )}
            {(state == "saving" || state == "compose") && (
              <>Send (shift+enter)</>
            )}
            {state == "sent" && <>Sent</>}
          </Button>
          <div style={{ flex: 1 }} />
          <Button
            size="large"
            disabled={
              onCancel == null &&
              (state != "compose" ||
                (subject == "" && toId == "" && body == ""))
            }
            onClick={() => {
              discardDraft();
              onCancel?.();
            }}
          >
            <Icon name="trash" /> Discard Draft
          </Button>
        </Flex>
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
