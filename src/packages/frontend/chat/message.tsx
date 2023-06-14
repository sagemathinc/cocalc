/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties } from "react";
import { Map } from "immutable";
import { IS_TOUCH } from "@cocalc/frontend/feature";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import {
  is_editing,
  message_colors,
  newest_content,
  sender_is_viewer,
} from "./utils";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import {
  redux,
  useMemo,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon, Space, TimeAgo, Tip } from "@cocalc/frontend/components";
import { Button, Tooltip, Row, Col } from "antd";
import { getUserName } from "./chat-log";
import { HistoryTitle, HistoryFooter, History } from "./history";
import ChatInput from "./input";
import { ChatActions } from "./actions";
import { Time } from "./time";
import { Name } from "./name";

// 5 minutes -- how long to show the "regenerate button" for chatgpt.
// Don't show it forever, since we want to avoid clutter.
const regenerateCutoff = 1000 * 60 * 5;

const BLANK_COLUMN = <Col key={"blankcolumn"} xs={1}></Col>;

const MARKDOWN_STYLE = undefined;
// const MARKDOWN_STYLE = { maxHeight: "300px", overflowY: "auto" };

const BORDER = "2px solid #ccc";

const SHOW_EDIT_BUTTON_MS = 45000;

const REPLY_STYLE = {
  marginLeft: "75px",
  marginRight: "15px",
  borderLeft: BORDER,
  borderRight: BORDER,
  paddingLeft: "15px",
} as const;

interface Props {
  actions?: ChatActions;

  get_user_name: (account_id: string) => string;
  message: Map<string, any>; // immutable.js message object
  account_id: string;
  user_map?: Map<string, any>;
  project_id?: string; // improves relative links if given
  path?: string;
  font_size: number;
  is_prev_sender?: boolean;
  is_next_sender?: boolean;
  show_avatar?: boolean;
  include_avatar_col?: boolean;
  selectedHashtags?: Set<string>;

  set_scroll?: Function;
  scroll_into_view: () => void; // call to scroll this message into view

  // if true, include a reply button - this should only be for messages
  // that don't have an existing reply to them already.
  allowReply?: boolean;
}

export default function Message(props: Props) {
  const [edited_message, set_edited_message] = useState<string>(
    newest_content(props.message)
  );
  // We have to use a ref because of trickiness involving
  // stale closures when submitting the message.
  const edited_message_ref = useRef(edited_message);

  const [show_history, set_show_history] = useState(false);

  const new_changes = useMemo(
    () => edited_message !== newest_content(props.message),
    [props.message] /* note -- edited_message is a function of props.message */
  );

  // date as ms since epoch or 0
  const date = useMemo(() => {
    return props.message?.get("date")?.valueOf() ?? 0;
  }, [props.message.get("date")]);

  const generating = props.message.get("generating");

  const history_size = useMemo(
    () => props.message.get("history").size,
    [props.message]
  );

  const isEditing = useMemo(
    () => is_editing(props.message, props.account_id),
    [props.message, props.account_id]
  );

  const editor_name = useMemo(() => {
    return props.get_user_name(
      props.message.get("history")?.first()?.get("author_id")
    );
  }, [props.message]);

  const submitMentionsRef = useRef<Function>();

  const [replying, setReplying] = useState<boolean>(false);
  const replyMessageRef = useRef<string>("");
  const replyMentionsRef = useRef<Function>();

  const is_viewers_message = sender_is_viewer(props.account_id, props.message);
  const verb = show_history ? "Hide" : "Show";

  const isChatGPTThread = useMemo(
    () => props.actions?.isChatGPTThread(props.message.get("date")),
    [props.message]
  );

  function editing_status(is_editing: boolean) {
    let text;
    const other_editors = props.message
      .get("editing")
      .remove(props.account_id)
      .keySeq();
    if (is_editing) {
      if (other_editors.size === 1) {
        // This user and someone else is also editing
        text = (
          <>
            {`WARNING: ${props.get_user_name(
              other_editors.first()
            )} is also editing this! `}
            <b>Simultaneous editing of messages is not supported.</b>
          </>
        );
      } else if (other_editors.size > 1) {
        // Multiple other editors
        text = `${other_editors.size} other users are also editing this!`;
      } else if (
        history_size !== props.message.get("history").size &&
        new_changes
      ) {
        text = `${editor_name} has updated this message. Esc to discard your changes and see theirs`;
      } else {
        if (IS_TOUCH) {
          text = "You are now editing ...";
        } else {
          text = "You are now editing ... Shift+Enter to submit changes.";
        }
      }
    } else {
      if (other_editors.size === 1) {
        // One person is editing
        text = `${props.get_user_name(
          other_editors.first()
        )} is editing this message`;
      } else if (other_editors.size > 1) {
        // Multiple editors
        text = `${other_editors.size} people are editing this message`;
      } else if (newest_content(props.message).trim() === "") {
        text = `Deleted by ${editor_name}`;
      }
    }

    if (text == null) {
      text = `Last edit by ${editor_name}`;
    }

    if (
      !is_editing &&
      other_editors.size === 0 &&
      newest_content(props.message).trim() !== ""
    ) {
      const edit = "Last edit ";
      const name = ` by ${editor_name}`;
      return (
        <div
          style={{
            marginBottom: "2px",
            fontSize: "14px" /* matches Reply button */,
          }}
        >
          {edit}
          <TimeAgo
            date={new Date(props.message.get("history").first()?.get("date"))}
          />
          {name}
        </div>
      );
    }
    return (
      <div style={{ marginTop: "5px" }}>
        {text}
        {is_editing ? (
          <span style={{ margin: "10px 10px 0 10px", display: "inline-block" }}>
            <Button onClick={on_cancel}>Cancel</Button>
            <Space />
            <Button onClick={saveEditedMessage} type="primary">
              Save (shift+enter)
            </Button>
          </span>
        ) : undefined}
      </div>
    );
  }

  function edit_message() {
    if (
      props.project_id == null ||
      props.path == null ||
      props.actions == null
    ) {
      // no editing functionality or not in a project with a path.
      return;
    }
    props.actions.set_editing(props.message, true);
    props.scroll_into_view();
  }

  function avatar_column() {
    const sender_id = props.message.get("sender_id");
    let style: CSSProperties = {};
    if (!props.is_prev_sender) {
      style.marginTop = "22px";
    }
    if (!props.message.get("reply_to")) {
      if (sender_is_viewer(props.account_id, props.message)) {
        style.marginLeft = "15px";
      } else {
        style.marginRight = "15px";
      }
    }

    return (
      <Col key={0} xs={2}>
        <div style={style}>
          {sender_id != null && props.show_avatar ? (
            <Avatar size={40} account_id={sender_id} />
          ) : undefined}
        </div>
      </Col>
    );
  }

  function content_column() {
    let borderRadius, marginBottom, marginTop: any;
    let value = newest_content(props.message);

    const { background, color, lighten, message_class } = message_colors(
      props.account_id,
      props.message
    );

    const font_size = `${props.font_size}px`;

    if (props.show_avatar) {
      marginBottom = "1vh";
    } else {
      marginBottom = "3px";
    }

    if (!props.is_prev_sender && is_viewers_message) {
      marginTop = "17px";
    }

    if (!props.is_prev_sender && !props.is_next_sender && !show_history) {
      borderRadius = "10px 10px 10px 10px";
    } else if (!props.is_prev_sender) {
      borderRadius = "10px 10px 5px 5px";
    } else if (!props.is_next_sender) {
      borderRadius = "5px 5px 10px 10px";
    }

    const message_style: CSSProperties = {
      color,
      background,
      wordWrap: "break-word",
      marginBottom,
      marginTop,
      borderRadius,
      fontSize: font_size,
      padding: "9px",
    };

    return (
      <Col key={1} xs={21}>
        <div style={{ display: "flex" }}>
          {!props.is_prev_sender &&
          !is_viewers_message &&
          props.message.get("sender_id") ? (
            <Name
              sender_name={props.get_user_name(props.message.get("sender_id"))}
            />
          ) : undefined}
          {generating === true && props.actions && (
            <Button
              style={{ color: "#666" }}
              onClick={() => {
                props.actions?.chatgptStopGenerating(new Date(date));
              }}
            >
              <Icon name="square" /> Stop Generating
            </Button>
          )}
        </div>
        <div
          style={message_style}
          className="smc-chat-message"
          onDoubleClick={edit_message}
        >
          {!isEditing && (
            <span style={lighten}>
              <Time message={props.message} edit={edit_message} />
            </span>
          )}
          {!isEditing && (
            <MostlyStaticMarkdown
              style={MARKDOWN_STYLE}
              value={value}
              className={message_class}
              selectedHashtags={props.selectedHashtags}
              toggleHashtag={
                props.selectedHashtags != null && props.actions != null
                  ? (tag) =>
                      props.actions?.setHashtagState(
                        tag,
                        props.selectedHashtags?.has(tag) ? undefined : 1
                      )
                  : undefined
              }
            />
          )}
          {isEditing && renderEditMessage()}
          {!isEditing && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <div>
                {Date.now() - date < SHOW_EDIT_BUTTON_MS && (
                  <Tooltip
                    title="Edit this message. You can edit any past message by anybody at any time by double clicking on it."
                    placement="left"
                  >
                    <Button
                      disabled={replying}
                      style={{
                        color: is_viewers_message ? "white" : "#555",
                      }}
                      type="text"
                      size="small"
                      onClick={() =>
                        props.actions?.set_editing(props.message, true)
                      }
                    >
                      <Icon name="pencil" /> Edit
                    </Button>
                  </Tooltip>
                )}
                {!props.message.get("reply_to") &&
                  props.allowReply &&
                  !replying && (
                    <Button
                      type="text"
                      disabled={replying}
                      style={{
                        color: is_viewers_message ? "white" : "#555",
                      }}
                      size="small"
                      onClick={() => setReplying(true)}
                    >
                      <Icon name="reply" /> Reply
                    </Button>
                  )}
              </div>
              {(props.message.get("history").size > 1 ||
                props.message.get("editing").size > 0) &&
                editing_status(isEditing)}
              {props.message.get("history").size > 1 && (
                <Button
                  style={{
                    marginLeft: "5px",
                    color: is_viewers_message ? "white" : "#555",
                  }}
                  type="text"
                  size="small"
                  onClick={() => {
                    set_show_history(!show_history);
                    props.set_scroll?.();
                  }}
                >
                  <Tip
                    title="Message History"
                    tip={`${verb} history of editing of this message.  Any collaborator can edit any message by double clicking on it.`}
                  >
                    <Icon name="history" /> {verb} History
                  </Tip>
                </Button>
              )}
            </div>
          )}
        </div>
        {show_history && (
          <div>
            <HistoryTitle />
            <History
              history={props.message.get("history")}
              user_map={props.user_map}
            />
            <HistoryFooter />
          </div>
        )}
        {replying && renderComposeReply()}
      </Col>
    );
  }

  function saveEditedMessage(): void {
    if (props.actions == null) return;
    const mesg = submitMentionsRef.current?.() ?? edited_message_ref.current;
    const value = newest_content(props.message);
    if (mesg !== value) {
      set_edited_message(mesg);
      props.actions.send_edit(props.message, mesg);
    } else {
      props.actions.set_editing(props.message, false);
    }
  }

  function on_cancel(): void {
    set_edited_message(newest_content(props.message));
    if (props.actions == null) return;
    props.actions.set_editing(props.message, false);
    props.actions.delete_draft(date);
  }

  function renderEditMessage() {
    if (
      props.project_id == null ||
      props.path == null ||
      props.actions?.syncdb == null
    ) {
      // should never get into this position
      // when null.
      return;
    }
    return (
      <div>
        <ChatInput
          autoFocus
          cacheId={`${props.path}${props.project_id}${date}`}
          input={newest_content(props.message)}
          submitMentionsRef={submitMentionsRef}
          on_send={saveEditedMessage}
          height={"auto"}
          syncdb={props.actions.syncdb}
          date={date}
          onChange={(value) => {
            edited_message_ref.current = value;
          }}
        />
        <div style={{ marginTop: "10px" }}>
          <Button
            type="primary"
            style={{ marginRight: "5px" }}
            onClick={saveEditedMessage}
          >
            <Icon name="save" /> Save Edited Message
          </Button>
          <Button
            onClick={() => {
              props.actions?.set_editing(props.message, false);
              props.actions?.delete_draft(date);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  function sendReply() {
    if (props.actions == null) return;
    const reply = replyMentionsRef.current?.() ?? replyMessageRef.current;
    props.actions.send_reply({ message: props.message, reply });
    setReplying(false);
  }

  function renderComposeReply() {
    if (
      props.project_id == null ||
      props.path == null ||
      props.actions?.syncdb == null
    ) {
      // should never get into this position
      // when null.
      return;
    }
    return (
      <div style={{ marginLeft: "30px" }}>
        <ChatInput
          autoFocus
          style={{
            borderRadius: "8px",
            height: "auto" /* for some reason the default 100% breaks things */,
          }}
          cacheId={`${props.path}${props.project_id}${date}-reply`}
          input={""}
          submitMentionsRef={replyMentionsRef}
          on_send={sendReply}
          height={"auto"}
          syncdb={props.actions.syncdb}
          date={-date}
          onChange={(value) => {
            replyMessageRef.current = value;
          }}
          placeholder={"Reply to the above message..."}
        />
        <div style={{ margin: "5px 0" }}>
          <Button
            onClick={sendReply}
            type="primary"
            style={{ marginRight: "5px" }}
          >
            <Icon name="paper-plane" /> Send Reply
          </Button>
          <Button
            onClick={() => {
              setReplying(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  function getStyle() {
    if (!props.message.get("reply_to")) return undefined;
    if (props.allowReply) {
      return {
        ...REPLY_STYLE,
        borderBottom: BORDER,
        borderBottomLeftRadius: "10px",
        borderBottomRightRadius: "10px",
        marginBottom: "10px",
      };
    }
    return REPLY_STYLE;
  }

  let cols;
  if (props.include_avatar_col) {
    cols = [avatar_column(), content_column(), BLANK_COLUMN];
    // mirror right-left for sender's view
    if (
      !props.message.get("reply_to") &&
      sender_is_viewer(props.account_id, props.message)
    ) {
      cols = cols.reverse();
    }
  } else {
    cols = [content_column(), BLANK_COLUMN];
    // mirror right-left for sender's view
    if (
      !props.message.get("reply_to") &&
      sender_is_viewer(props.account_id, props.message)
    ) {
      cols = cols.reverse();
    }
  }

  return (
    <Row style={getStyle()}>
      {cols}
      {!replying && props.message.get("reply_to") && props.allowReply && (
        <div
          style={{ textAlign: "center", marginBottom: "5px", width: "100%" }}
        >
          {!generating && (
            <Tooltip
              title={
                isChatGPTThread
                  ? "Reply to ChatGPT, sending the entire thread as context."
                  : "Reply in this thread."
              }
            >
              <Button
                type="text"
                onClick={() => setReplying(true)}
                style={{ color: "#666" }}
              >
                <Icon name="reply" /> Reply
                {isChatGPTThread
                  ? ` to GPT-${isChatGPTThread == "gpt-4" ? "4" : "3.5"}`
                  : ""}
                {isChatGPTThread && (
                  <Avatar
                    account_id="chatgpt"
                    size={16}
                    style={{ marginLeft: "10px", marginBottom: "2.5px" }}
                  />
                )}
              </Button>
            </Tooltip>
          )}
          {!generating &&
            props.actions &&
            Date.now() - date <= regenerateCutoff && (
              <Button
                style={{ color: "#666", marginLeft: "15px" }}
                onClick={() => {
                  props.actions?.chatgptRegenerate(new Date(date));
                }}
              >
                <Icon name="refresh" /> Regenerate response
              </Button>
            )}
        </div>
      )}
    </Row>
  );
}

// Used for exporting chat to markdown file
export function message_to_markdown(message): string {
  let value = newest_content(message);
  const user_map = redux.getStore("users").get("user_map");
  const sender = getUserName(user_map, message.get("sender_id"));
  const date = message.get("date").toString();
  return `*From:* ${sender}  \n*Date:* ${date}  \n\n${value}`;
}
