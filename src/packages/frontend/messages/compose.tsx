/*
Editing/composing a message.

TODO: There is a slider with all versions, but it is not persisted
between editing sessions of a draft.  It could be, e.g., via json
to the database or something...
*/

import { Button, Flex, Input, Modal, Slider, Space, Spin, Tooltip } from "antd";
import { isEqual } from "lodash";
import { useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useAsyncEffect } from "use-async-effect";
import {
  redux,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Paragraph } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { labels } from "@cocalc/frontend/i18n";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import ephemeralSyncstring from "@cocalc/sync/editor/string/test/ephemeral-syncstring";
import { MAX_BLOB_SIZE } from "@cocalc/util/db-schema/blobs";
import { human_readable_size } from "@cocalc/util/misc";
import SelectUsers from "./select-users";
import Zoom from "./zoom";
import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";

export default function Compose({
  onCancel,
  onSend,
  style,
  message,
}: {
  onCancel?: Function;
  onSend?: Function;
  style?;
  // if message is given, initialize state with this, which should
  // be a draft, i.e., sent is not set and it is from us!
  message?;
}) {
  const intl = useIntl();
  const actions = useActions("messages");
  const fontSize = useTypedRedux("messages", "fontSize");
  const draftId = useRef<number | null>(message?.id ?? null);

  const [to_ids, setToIds] = useState<string[]>(() => {
    if (message?.to_ids) {
      return message.to_ids;
    }
    return [];
  });
  const [subject, setSubject] = useState<string>(message?.subject ?? "");
  const [body, setBody] = useState<string>(message?.body ?? "");
  const [bodyIsFocused, setBodyIsFocused] = useState<boolean | undefined>(
    undefined,
  );

  const [version, setVersion] = useState<number>(0);
  const [versions, setVersions] = useState<Date[]>([]);
  const renderSliderTooltip = (index) => {
    const logicalTime = versions[index];
    if (logicalTime == null) {
      return;
    }
    const date = syncstringRef.current?.wallTime(logicalTime);
    if (date == null) {
      return;
    }
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
    to_ids: string[];
    subject: string;
    body: string;
  }>({ to_ids, subject, body });

  const [error, setError] = useState<string>("");
  const [state, setState] = useState<"compose" | "saving" | "sending" | "sent">(
    "compose",
  );

  const discardDraft = async () => {
    if (draftId.current == null) {
      return;
    }
    try {
      const id = draftId.current;
      draftId.current = null;
      await actions.updateDraft({
        id,
        to_ids,
        // break it from the current thread
        thread_id: 0,
      });
      await actions.mark({
        id,
        deleted: true,
      });
    } catch (_err) {}
  };

  const saveQueueRef = useRef<{ subject: string; body: string } | null>(null);
  const saveDraft = async (y: {
    subject?: string;
    body?: string;
    to_ids?: string[];
  }) => {
    const x = {
      subject: y.subject ?? subject,
      body: y.body ?? body,
      to_ids: y.to_ids ?? to_ids,
    };
    if (draftId.current === 0) {
      // it's very important not to just discard this, in case user
      // quickly closes their draft
      saveQueueRef.current = x;
      // currently creating draft
      return;
    }
    if (
      state == "sending" ||
      state == "sent" ||
      to_ids.length == 0 ||
      (isEqual(draft.to_ids, x.to_ids) &&
        draft.subject == x.subject &&
        draft.body == x.body)
    ) {
      return;
    }
    try {
      setError("");
      setState("saving");
      const thread_id = message?.thread_id;
      if (draftId.current == null) {
        draftId.current = 0;
        const id = await actions.createDraft({
          thread_id,
          ...x,
        });
        draftId.current = id;
        if (saveQueueRef.current != null) {
          actions.updateDraft({
            id,
            thread_id,
            ...saveQueueRef.current,
            debounceSave: true,
          });
          saveQueueRef.current = null;
        }
      } else {
        actions.updateDraft({
          id: draftId.current,
          debounceSave: true,
          thread_id,
          ...x,
        });
      }
      setDraft(x);
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
    const thread_id =
      (message?.subject?.trim() ?? "") == subject.trim()
        ? message.thread_id
        : 0;
    try {
      setError("");
      setState("sending");
      if (!draftId.current) {
        throw Error("no draft message to send");
      }
      actions.updateDraft({
        id: draftId.current,
        to_ids,
        thread_id,
        subject,
        body: body0 ?? body,
        sent: webapp_client.server_time(),
      });
      // we have obviously read a message we wrote.
      await actions.mark({ id: draftId.current, read: true });
      setState("sent");
      onSend?.();
    } catch (err) {
      setError(`${err}`);
      setState("compose");
    }
  };

  const editorDivRef = useRef<any>(null);

  const saved = body == draft.body && subject == draft.subject;

  return (
    <Space direction="vertical" style={{ width: "100%", ...style }}>
      <ShowError
        error={error}
        setError={setError}
        style={{ marginTop: "15px" }}
      />
      <div
        style={{
          paddingRight: "20px",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div style={{ width: "82px", fontSize: "12pt" }}>
          {intl.formatMessage(labels.messages_to)}:
        </div>
        <SelectUsers
          style={{ width: "100%" }}
          autoOpen={draftId.current && to_ids.length > 0 ? undefined : 250}
          autoFocus={!draftId.current || to_ids.length == 0}
          disabled={state != "compose"}
          placeholder={intl.formatMessage({
            id: "messages.compose.to.placeholder",
            defaultMessage: "Add one or more users by name or email address...",
          })}
          onChange={(account_ids) => {
            setToIds(account_ids);
            saveDraft({ to_ids: account_ids });
          }}
          defaultValue={draftId.current ? to_ids : undefined}
        />
      </div>
      <Flex>
        <Flex style={{ alignItems: "center", flex: 1 }}>
          <div style={{ width: "75px", fontSize: "12pt" }}>
            {intl.formatMessage(labels.messages_subject)}:
          </div>
          <Input
            onFocus={() => {
              setBodyIsFocused(false);
            }}
            onKeyDown={(e) => {
              if (e.key == "Tab" || e.key == "ArrowDown") {
                // yes I designed a really weird way to focus the markdown editor...
                setTimeout(() => setBodyIsFocused(true), 1);
              }
            }}
            style={{ flex: 1, fontSize: "12pt" }}
            disabled={state == "sending" || state == "sent"}
            placeholder={`${intl.formatMessage(labels.messages_subject)}...`}
            status={!subject?.trim() && body.trim() ? "error" : undefined}
            value={subject}
            onChange={(e) => {
              const subject = e.target.value;
              setSubject(subject);
              saveDraft({ body, subject });
            }}
          />
        </Flex>
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
        <Zoom style={{ margin: "0 5px" }} />
        <Tooltip
          placement="right"
          title={intl.formatMessage(
            {
              id: "messages.compose.save_button.tooltip",
              defaultMessage: `{saved, select, true {Saved} other {Not Saved}}.
              Edit this message later before sending it.`,
            },
            { saved },
          )}
        >
          <Button
            onClick={() => saveDraft({ subject, body })}
            style={{ marginLeft: "15px" }}
            disabled={saved || state == "saving"}
          >
            <Icon name="save" />{" "}
            {intl.formatMessage(
              {
                id: "messages.compose.save_button",
                defaultMessage: "{saved, select, true {Saved} other {Save}}",
              },
              { saved },
            )}
            {state === "saving" && (
              <Spin style={{ marginLeft: "15px" }} delay={1000} />
            )}
          </Button>
        </Tooltip>
      </Flex>
      {state == "sending" ||
        (state == "sent" && (
          <StaticMarkdown value={body} style={{ fontSize }} />
        ))}
      {!(state == "sending" || state == "sent") && (
        <MarkdownInput
          fontSize={fontSize}
          isFocused={bodyIsFocused}
          editorDivRef={editorDivRef}
          getValueRef={getValueRef}
          saveDebounceMs={SAVE_DEBOUNCE_MS}
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
          placeholder={`${intl.formatMessage(labels.messages_body)}...`}
          autoFocus={message != null && to_ids.length > 0}
          height="40vh"
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
        <Paragraph
          type="secondary"
          style={{
            marginBottom: "5px",
            fontSize: "11pt",
          }}
        >
          <FormattedMessage
            id="messages.compose.info_bottom"
            defaultMessage={
              "Drag and drop or paste images or other files (max size: {max_size}) to include them in your message."
            }
            values={{ max_size: human_readable_size(MAX_BLOB_SIZE) }}
          />
        </Paragraph>
        <Flex>
          <Button
            size="large"
            disabled={
              !subject.trim() ||
              to_ids.length == 0 ||
              state == "sending" ||
              state == "sent"
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
              <>
                <FormattedMessage
                  id="messages.send.label"
                  // cSpell:ignore nosubject
                  defaultMessage={`Send (shift+enter){nosubject, select, true { - enter subject above} other {}}`}
                  values={{ nosubject: !subject.trim() }}
                  description={"Send button for sending a message to someone."}
                />
              </>
            )}
            {state == "sent" && <>Sent</>}
          </Button>
          <div style={{ flex: 1 }} />
          <Button
            size="large"
            disabled={
              onCancel == null &&
              (state != "compose" ||
                (subject == "" && to_ids.length == 0 && body == ""))
            }
            onClick={() => {
              discardDraft();
              onCancel?.();
            }}
          >
            <Icon name="trash" />{" "}
            <FormattedMessage
              id="messages.discard_draft.label"
              defaultMessage="Discard Draft"
            />
          </Button>
        </Flex>
      </div>
    </Space>
  );
}

export function ComposeButton(props) {
  return (
    <Button
      {...props}
      onClick={() => {
        redux.getActions("messages")?.setState({ compose: true });
        if (!redux.getStore("mentions").get("filter").startsWith("messages-")) {
          redux.getActions("mentions").setState({
            filter: "messages-sent",
            id: undefined,
          });
        }
      }}
    >
      <Icon name="pencil" />{" "}
      <FormattedMessage id="messages.compose.label" defaultMessage="Compose" />
    </Button>
  );
}

// Modal has to be a separate component and can't be in the
// ComposeButton component above, since that button is in the
// nav menu, and if the Modal is in the nav menu, then when the
// modal is open, the keyboard moves the nav menu up and down!
export function ComposeModal() {
  const compose = useTypedRedux("messages", "compose");
  const close = () => {
    redux.getActions("messages")?.setState({ compose: false });
  };
  return (
    <Modal
      destroyOnHidden
      open={compose}
      styles={{ content: { maxWidth: "1000px", margin: "auto" } }}
      width={"85%"}
      onCancel={close}
      onOk={close}
      footer={[]}
    >
      <Compose onSend={close} onCancel={close} />
    </Modal>
  );
}
