/*
Editing/composing a message.

TODO: There is a slider with all versions, but it is not persisted
between editing sessions of a draft.  It could be, e.g., via json
to the database or something...
*/

import {
  Button,
  Divider,
  Flex,
  Input,
  Modal,
  Slider,
  Space,
  Spin,
  Tooltip,
} from "antd";
import SelectUser from "./select-user";
import { useEffect, useRef, useState } from "react";
import { useActions } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import type { Message } from "@cocalc/util/db-schema/messages";
import { isFromMe } from "./util";
import User from "./user";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useInterval } from "react-interval-hook";
import ephemeralSyncstring from "@cocalc/sync/editor/string/test/ephemeral-syncstring";
import { useAsyncEffect } from "use-async-effect";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { MAX_BLOB_SIZE } from "@cocalc/util/db-schema/blobs";
import { human_readable_size } from "@cocalc/util/misc";

const SAVE_INTERVAL_S = 10;

export default function Compose({
  replyTo,
  onCancel,
  onSend,
  style,
  message,
}: {
  replyTo?: Message;
  onCancel?: Function;
  onSend?: Function;
  style?;
  // if message is given, initialize state with this, which should
  // be a draft, i.e., sent is not set and it is from us!
  message?;
}) {
  const actions = useActions("messages");
  const draftId = useRef<number | null>(message?.id ?? null);

  const [to_type] = useState<string>(
    message?.to_type ?? replyTo?.from_type ?? "account",
  );
  // [ ] todo type != 'account' for destination!
  const [to_id, setToId] = useState<string>(() => {
    if (message?.to_id) {
      return message.to_id;
    }
    if (isFromMe(replyTo)) {
      return replyTo?.to_id ?? "";
    }
    return replyTo?.from_id ?? "";
  });
  const [subject, setSubject] = useState<string>(
    message?.subject ?? replySubject(replyTo?.subject),
  );
  const [body, setBody] = useState<string>(message?.body ?? "");

  const [version, setVersion] = useState<number>(0);
  const [versions, setVersions] = useState<Date[]>([]);
  const renderSliderTooltip = (index) => {
    const date = versions[index];
    if (date == null) return;
    return <TimeAgo date={date} />;
  };
  const getValueRef = useRef<any>(null);
  const syncstringRef = useRef<any>(null);
  useAsyncEffect(async () => {
    const syncstring = await ephemeralSyncstring();
    syncstringRef.current = syncstring;
    syncstring.from_str(body);
    syncstring.save();
    return async () => {
      if (syncstringRef.current != null) {
        await syncstringRef.current.close();
        syncstringRef.current = null;
      }
    };
  }, []);

  const [draft, setDraft] = useState<{
    to_id: string;
    to_type: string;
    subject: string;
    body: string;
  }>({ to_id, to_type, subject, body });

  const [error, setError] = useState<string>("");
  const [state, setState] = useState<"compose" | "saving" | "sending" | "sent">(
    "compose",
  );

  const discardDraft = async () => {
    if (draftId.current == null) {
      return;
    }
    try {
      actions.updateDraft({
        id: draftId.current,
        expire: webapp_client.server_time(),
        deleted: true,
      });
      draftId.current = null;
    } catch (_err) {}
  };

  const saveDraft = async ({ subject, body }, save = false) => {
    if (draftId.current === 0) {
      // currently creating draft
      return;
    }
    if (
      !save &&
      (state == "sending" ||
        state == "sent" ||
        !to_id ||
        !to_type ||
        (draft.to_id == to_id &&
          draft.to_type == to_type &&
          draft.subject == subject &&
          draft.body == body))
    ) {
      return;
    }
    try {
      setError("");
      setState("saving");
      if (draftId.current == null) {
        draftId.current = 0;
        draftId.current = await actions.createDraft({
          to_id,
          to_type,
          thread_id: getThreadId({ message, replyTo, subject }),
          subject,
          body,
        });
      } else {
        actions.updateDraft({
          id: draftId.current,
          to_id,
          to_type,
          thread_id: getThreadId({ message, replyTo, subject }),
          subject,
          body,
        });
      }
      setDraft({ to_id, to_type, subject, body });
    } catch (err) {
      setError(`${err}`);
    } finally {
      if (draftId.current === 0) {
        // failed to create
        draftId.current = null;
      }
      setState("compose");
    }
  };

  const send = async (body0?: string) => {
    try {
      setError("");
      setState("sending");
      if (draftId.current) {
        actions.updateDraft({
          id: draftId.current,
          to_id,
          to_type,
          thread_id: getThreadId({ message, replyTo, subject }),
          subject,
          body: body0 ?? body,
          sent: webapp_client.server_time(),
        });
        await actions.saveSentMessagesTable();
      } else {
        await actions.send({
          to_id,
          to_type,
          subject,
          body: body0 ?? body,
          thread_id: getThreadId({ message, replyTo, subject }),
        });
      }
      setState("sent");
      onSend?.();
    } catch (err) {
      setError(`${err}`);
      setState("compose");
    }
  };

  // fire off a save on unmount of this component
  useEffect(() => {
    return () => {
      actions.saveSentMessagesTable();
    };
  }, []);

  // also just ensure every so often that any drafts are saved
  // to the backend.
  useInterval(() => {
    actions.saveSentMessagesTable();
  }, SAVE_INTERVAL_S * 1000);

  return (
    <Space direction="vertical" style={{ width: "100%", ...style }}>
      <ShowError
        error={error}
        setError={setError}
        style={{ marginTop: "15px" }}
      />
      {replyTo == null && message == null && (
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
      {replyTo != null && to_id != null && (
        <div style={{ color: "#666" }}>
          to <User id={to_id} type="account" show_avatar />
        </div>
      )}
      <Flex>
        <Input
          style={{ flex: 1 }}
          disabled={state == "sending" || state == "sent"}
          placeholder="Subject..."
          value={subject}
          onChange={(e) => {
            const subject = e.target.value;
            setSubject(subject);
            saveDraft({ body, subject });
          }}
        />
        {version != null && versions != null && versions.length >= 2 && (
          <div style={{ flex: 1, margin: "0 10px" }}>
            <Slider
              min={0}
              max={versions.length - 1}
              value={version}
              onChange={(version) => {
                setVersion(version);
                if (version < versions.length) {
                  const body = syncstringRef.current
                    ?.version(versions[version])
                    ?.to_str();
                  if (body != null) {
                    setBody(body);
                    saveDraft({ subject, body });
                  }
                }
              }}
              tooltip={{
                formatter: renderSliderTooltip,
                placement: "bottom",
              }}
            />
          </div>
        )}

        <Tooltip
          title={`Status: ${body == draft.body && subject == draft.subject ? "Saved" : "Not Saved"}. You can edit this later before sending it.`}
        >
          <Button
            onClick={() => saveDraft({ subject, body })}
            style={{ marginLeft: "15px" }}
            disabled={
              (body == draft.body && subject == draft.subject) ||
              state == "saving"
            }
          >
            <Icon name="save" /> Save
            {body == draft.body && subject == draft.subject ? "d" : ""}
            {state == "saving" && (
              <Spin style={{ marginLeft: "15px" }} delay={1000} />
            )}
          </Button>
        </Tooltip>
      </Flex>
      {state == "sending" ||
        (state == "sent" && <StaticMarkdown value={body} />)}
      {!(state == "sending" || state == "sent") && (
        <MarkdownInput
          getValueRef={getValueRef}
          saveDebounceMs={200}
          value={body}
          onChange={(body) => {
            const syncstring = syncstringRef.current;
            if (syncstring != null) {
              syncstring.from_str(body);
              syncstring.save();
              syncstring.exit_undo_mode();
              const versions = syncstring.versions();
              setVersions(versions);
              setVersion(versions.length - 1);
            }
            setBody(body);
            saveDraft({ body, subject });
          }}
          placeholder="Body..."
          autoFocus={replyTo != null || message != null}
          style={{ minHeight: "200px" }}
          onShiftEnter={(body) => {
            setBody(body);
            if (body.trim()) {
              send(body);
            }
          }}
          onUndo={() => {
            const syncstring = syncstringRef.current;
            if (syncstring != null) {
              if (syncstring.undo_state == null) {
                const value = getValueRef.current?.();
                if (value != null && value != syncstring.to_str()) {
                  syncstring.from_str(value);
                  syncstring.save();
                }
              }
              syncstring.undo();
              setBody(syncstring.to_str());
            }
          }}
          onRedo={() => {
            const syncstring = syncstringRef.current;
            if (syncstring != null) {
              if (syncstring.undo_state == null) {
                const value = getValueRef.current?.();
                if (value != null && value != syncstring.to_str()) {
                  syncstring.from_str(value);
                  syncstring.save();
                }
              }
              syncstring.redo();
              setBody(syncstring.to_str());
            }
          }}
        />
      )}
      <div>
        <div style={{ color: "#888" }}>
          Drag and drop or paste images or other files (max size:{" "}
          {human_readable_size(MAX_BLOB_SIZE)}) to include them in your message.
        </div>
        <Divider />
        <Flex>
          <Button
            size="large"
            disabled={
              !subject.trim() ||
              !to_id ||
              state == "sending" ||
              state == "sent" ||
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
                (subject == "" && to_id == "" && body == ""))
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
function getThreadId({ message, replyTo, subject }) {
  if (message?.thread_id) {
    return message?.thread_id;
  }
  if (replyTo == null) {
    return undefined;
  }
  if (subject.trim() == replySubject(replyTo?.subject)) {
    return replyTo?.thread_id ?? replyTo?.id;
  }
  return undefined;
}
