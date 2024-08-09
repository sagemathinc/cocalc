/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Col, Popconfirm, Row, Space, Tooltip } from "antd";
import { Map } from "immutable";
import { CSSProperties, useEffect, useLayoutEffect } from "react";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import {
  CSS,
  redux,
  useMemo,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Gap,
  Icon,
  Paragraph,
  Text,
  TimeAgo,
  Tip,
} from "@cocalc/frontend/components";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import { IS_TOUCH } from "@cocalc/frontend/feature";
import { modelToName } from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { isLanguageModelService } from "@cocalc/util/db-schema/llm-utils";
import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { ChatActions } from "./actions";
import { getUserName } from "./chat-log";
import { History, HistoryFooter, HistoryTitle } from "./history";
import ChatInput from "./input";
import { LLMCostEstimationChat } from "./llm-cost-estimation";
import { FeedbackLLM } from "./llm-msg-feedback";
import { RegenerateLLM } from "./llm-msg-regenerate";
import { SummarizeThread } from "./llm-msg-summarize";
import { Name } from "./name";
import { Time } from "./time";
import { ChatMessageTyped, Mode, SubmitMentionsFn } from "./types";
import {
  is_editing,
  message_colors,
  newest_content,
  sender_is_viewer,
} from "./utils";

const DELETE_BUTTON = false;

const BLANK_COLUMN = (xs) => <Col key={"blankcolumn"} xs={xs}></Col>;

const MARKDOWN_STYLE = undefined;
// const MARKDOWN_STYLE = { maxHeight: "300px", overflowY: "auto" };

const BORDER = "2px solid #ccc";

const SHOW_EDIT_BUTTON_MS = 45000;

const TRHEAD_STYLE_SINGLE: CSS = {
  marginLeft: "15px",
  marginRight: "15px",
  paddingLeft: "15px",
} as const;

const THREAD_STYLE: CSS = {
  ...TRHEAD_STYLE_SINGLE,
  borderLeft: BORDER,
  borderRight: BORDER,
} as const;

const THREAD_STYLE_BOTTOM: CSS = {
  ...THREAD_STYLE,
  borderBottomLeftRadius: "10px",
  borderBottomRightRadius: "10px",
  borderBottom: BORDER,
  marginBottom: "10px",
} as const;

const THREAD_STYLE_TOP: CSS = {
  ...THREAD_STYLE,
  borderTop: BORDER,
  borderTopLeftRadius: "10px",
  borderTopRightRadius: "10px",
  marginTop: "10px",
} as const;

const THREAD_STYLE_FOLDED: CSS = {
  ...THREAD_STYLE_TOP,
  ...THREAD_STYLE_BOTTOM,
} as const;

const MARGIN_TOP_VIEWER = "17px";

const AVATAR_MARGIN_LEFTRIGHT = "15px";

interface Props {
  index: number;
  actions?: ChatActions;

  get_user_name: (account_id?: string) => string;
  message: ChatMessageTyped;
  account_id: string;
  user_map?: Map<string, any>;
  project_id?: string; // improves relative links if given
  path?: string;
  font_size: number;
  is_prev_sender?: boolean;
  is_next_sender?: boolean;
  show_avatar?: boolean;
  mode: Mode;
  selectedHashtags?: Set<string>;

  scroll_into_view: () => void; // call to scroll this message into view

  // if true, include a reply button - this should only be for messages
  // that don't have an existing reply to them already.
  allowReply?: boolean;

  is_thread?: boolean; // if true, there is a thread starting in a reply_to message
  is_folded?: boolean; // if true, only show the reply_to root message
  is_thread_body: boolean;
  force_unfold?: boolean; // if true, all threads are temporarily forced to be unfolded

  llm_cost_reply?: [number, number] | null;
}

export default function Message(props: Readonly<Props>) {
  const {
    is_folded,
    force_unfold,
    is_thread_body,
    is_thread,
    llm_cost_reply,
    message,
    mode,
    project_id,
  } = props;

  const showAISummarize = redux
    .getStore("projects")
    .hasLanguageModelEnabled(project_id, "chat-summarize");

  const hideTooltip =
    useTypedRedux("account", "other_settings").get("hide_file_popovers") ??
    false;

  const [edited_message, set_edited_message] = useState<string>(
    newest_content(message),
  );
  // We have to use a ref because of trickiness involving
  // stale closures when submitting the message.
  const edited_message_ref = useRef(edited_message);

  const [show_history, set_show_history] = useState(false);

  const new_changes = useMemo(
    () => edited_message !== newest_content(message),
    [message] /* note -- edited_message is a function of message */,
  );

  // date as ms since epoch or 0
  const date: number = useMemo(() => {
    return message?.get("date")?.valueOf() ?? 0;
  }, [message.get("date")]);

  const generating = message.get("generating");

  const history_size = useMemo(() => message.get("history").size, [message]);

  const isEditing = useMemo(
    () => is_editing(message, props.account_id),
    [message, props.account_id],
  );

  const editor_name = useMemo(() => {
    return props.get_user_name(
      message.get("history")?.first()?.get("author_id"),
    );
  }, [message]);

  const reverseRowOrdering =
    !is_thread_body && sender_is_viewer(props.account_id, message);

  const submitMentionsRef = useRef<SubmitMentionsFn>();

  const [replying, setReplying] = useState<boolean>(() => {
    if (!props.allowReply) {
      return false;
    }
    const replyDate = -(props.actions?.store?.getThreadRootDate(date) ?? 0);
    const draft = props.actions?.syncdb?.get_one({
      event: "draft",
      sender_id: props.account_id,
      date: replyDate,
    });
    if (draft == null) {
      return false;
    }
    if (draft.get("active") <= 1720071100408) {
      // before this point in time, drafts never ever got deleted when sending replies!  So there's a massive
      // clutter of reply drafts sitting in chats, and we don't want to resurrect them.
      return false;
    }
    return true;
  });
  useEffect(() => {
    if (!props.allowReply) {
      setReplying(false);
    }
  }, [props.allowReply]);

  const [autoFocusReply, setAutoFocusReply] = useState<boolean>(false);
  const [autoFocusEdit, setAutoFocusEdit] = useState<boolean>(false);

  const replyMessageRef = useRef<string>("");
  const replyMentionsRef = useRef<SubmitMentionsFn>();

  const is_viewers_message = sender_is_viewer(props.account_id, message);
  const verb = show_history ? "Hide" : "Show";

  const isLLMThread = useMemo(
    () => props.actions?.isLanguageModelThread(message.get("date")),
    [message, props.actions != null],
  );

  const msgWrittenByLLM = useMemo(() => {
    const author_id = message.get("history")?.first()?.get("author_id");
    return typeof author_id === "string" && isLanguageModelService(author_id);
  }, [message]);

  useLayoutEffect(() => {
    if (replying) {
      props.scroll_into_view();
    }
  }, [replying]);

  function editing_status(is_editing: boolean) {
    let text;
    const other_editors = message
      .get("editing")
      .remove(props.account_id)
      // @ts-ignore – not sure why this error shows up
      .keySeq();
    if (is_editing) {
      if (other_editors.size === 1) {
        // This user and someone else is also editing
        text = (
          <>
            {`WARNING: ${props.get_user_name(
              other_editors.first(),
            )} is also editing this! `}
            <b>Simultaneous editing of messages is not supported.</b>
          </>
        );
      } else if (other_editors.size > 1) {
        // Multiple other editors
        text = `${other_editors.size} other users are also editing this!`;
      } else if (history_size !== message.get("history").size && new_changes) {
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
          other_editors.first(),
        )} is editing this message`;
      } else if (other_editors.size > 1) {
        // Multiple editors
        text = `${other_editors.size} people are editing this message`;
      } else if (newest_content(message).trim() === "") {
        text = `Deleted by ${editor_name}`;
      }
    }

    if (text == null) {
      text = `Last edit by ${editor_name}`;
    }

    if (
      !is_editing &&
      other_editors.size === 0 &&
      newest_content(message).trim() !== ""
    ) {
      const edit = "Last edit ";
      const name = ` by ${editor_name}`;
      const msg_date = message.get("history").first()?.get("date");
      return (
        <div
          style={{
            color: COLORS.GRAY_M,
            marginBottom: "2px",
            fontSize: "14px" /* matches Reply button */,
          }}
        >
          {edit}{" "}
          {msg_date != null ? (
            <TimeAgo date={new Date(msg_date)} />
          ) : (
            "unknown time"
          )}{" "}
          {name}
        </div>
      );
    }
    return (
      <div style={{ color: COLORS.GRAY_M }}>
        {text}
        {is_editing ? (
          <span style={{ margin: "10px 10px 0 10px", display: "inline-block" }}>
            <Button onClick={on_cancel}>Cancel</Button>
            <Gap />
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
    props.actions.set_editing(message, true);
    setAutoFocusEdit(true);
    props.scroll_into_view();
  }

  function avatar_column() {
    const sender_id = message.get("sender_id");
    let style: CSSProperties = {};
    if (!props.is_prev_sender) {
      style.marginTop = "22px";
    } else {
      style.marginTop = "5px";
    }

    if (!is_thread_body) {
      if (sender_is_viewer(props.account_id, message)) {
        style.marginLeft = AVATAR_MARGIN_LEFTRIGHT;
      } else {
        style.marginRight = AVATAR_MARGIN_LEFTRIGHT;
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
    let value = newest_content(message);

    const { background, color, lighten, message_class } = message_colors(
      props.account_id,
      message,
    );

    const font_size = `${props.font_size}px`;

    if (props.show_avatar) {
      marginBottom = "1vh";
    } else {
      marginBottom = "3px";
    }

    if (!props.is_prev_sender && is_viewers_message) {
      marginTop = MARGIN_TOP_VIEWER;
    } else {
      marginTop = "5px";
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
      ...(mode === "sidechat" ? { marginLeft: "5px", marginRight: "5px" } : {}),
    } as const;

    const mainXS = mode === "standalone" ? 20 : 22;
    const showEditButton = Date.now() - date < SHOW_EDIT_BUTTON_MS;

    return (
      <Col key={1} xs={mainXS}>
        <div style={{ display: "flex" }}>
          {!props.is_prev_sender &&
          !is_viewers_message &&
          message.get("sender_id") ? (
            <Name sender_name={props.get_user_name(message.get("sender_id"))} />
          ) : undefined}
          {generating === true && props.actions ? (
            <Button
              style={{ color: COLORS.GRAY_M }}
              onClick={() => {
                props.actions?.languageModelStopGenerating(new Date(date));
              }}
            >
              <Icon name="square" /> Stop Generating
            </Button>
          ) : undefined}
        </div>
        <div
          style={message_style}
          className="smc-chat-message"
          onDoubleClick={edit_message}
        >
          {!isEditing && (
            <span style={lighten}>
              <Time message={message} edit={edit_message} />
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
                        props.selectedHashtags?.has(tag) ? undefined : 1,
                      )
                  : undefined
              }
            />
          )}
          {isEditing && renderEditMessage()}
          {!isEditing && (
            <div style={{ width: "100%", textAlign: "center" }}>
              <Space direction="horizontal" size="small" wrap>
                {showEditButton ? (
                  <Tooltip
                    title="Edit this message. You can edit any past message by anybody at any time by double clicking on it.  Previous versions are in the history."
                    placement="left"
                  >
                    <Button
                      disabled={replying}
                      style={{
                        color: is_viewers_message ? "white" : "#555",
                      }}
                      type="text"
                      size="small"
                      onClick={() => props.actions?.set_editing(message, true)}
                    >
                      <Icon name="pencil" /> Edit
                    </Button>
                  </Tooltip>
                ) : undefined}
                {DELETE_BUTTON && newest_content(message).trim().length > 0 ? (
                  <Tooltip
                    title="Delete this message. You can delete any past message by anybody.  The deleted message can be view in history."
                    placement="left"
                  >
                    <Popconfirm
                      title="Delete this message"
                      description="Are you sure you want to delete this message?"
                      onConfirm={() => {
                        props.actions?.set_editing(message, true);
                        setTimeout(
                          () => props.actions?.send_edit(message, ""),
                          1,
                        );
                      }}
                    >
                      <Button
                        disabled={replying}
                        style={{
                          color: is_viewers_message ? "white" : "#555",
                        }}
                        type="text"
                        size="small"
                      >
                        <Icon name="trash" /> Delete
                      </Button>
                    </Popconfirm>
                  </Tooltip>
                ) : undefined}
                {message.get("history").size > 1 ||
                message.get("editing").size > 0
                  ? editing_status(isEditing)
                  : undefined}
                {message.get("history").size > 1 ? (
                  <Button
                    style={{
                      marginLeft: "5px",
                      color: is_viewers_message ? "white" : "#555",
                    }}
                    type="text"
                    size="small"
                    icon={<Icon name="history" />}
                    onClick={() => {
                      set_show_history(!show_history);
                      props.scroll_into_view?.();
                    }}
                  >
                    <Tip
                      title="Message History"
                      tip={`${verb} history of editing of this message.  Any collaborator can edit any message by double clicking on it.`}
                    >
                      {verb} History
                    </Tip>
                  </Button>
                ) : undefined}
                {isLLMThread && msgWrittenByLLM ? (
                  <>
                    <RegenerateLLM
                      actions={props.actions}
                      date={date}
                      model={isLLMThread}
                    />
                    <FeedbackLLM actions={props.actions} message={message} />
                  </>
                ) : undefined}
              </Space>
            </div>
          )}
        </div>
        {show_history && (
          <div>
            <HistoryTitle />
            <History
              history={message.get("history")}
              user_map={props.user_map}
            />
            <HistoryFooter />
          </div>
        )}
        {replying ? renderComposeReply() : undefined}
      </Col>
    );
  }

  function saveEditedMessage(): void {
    if (props.actions == null) return;
    const mesg = submitMentionsRef.current?.() ?? edited_message_ref.current;
    const value = newest_content(message);
    if (mesg !== value) {
      set_edited_message(mesg);
      props.actions.send_edit(message, mesg);
    } else {
      props.actions.set_editing(message, false);
    }
  }

  function on_cancel(): void {
    set_edited_message(newest_content(message));
    if (props.actions == null) return;
    props.actions.set_editing(message, false);
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
          autoFocus={autoFocusEdit}
          cacheId={`${props.path}${props.project_id}${date}`}
          input={newest_content(message)}
          submitMentionsRef={submitMentionsRef}
          on_send={saveEditedMessage}
          height={"auto"}
          syncdb={props.actions.syncdb}
          date={date}
          onChange={(value) => {
            edited_message_ref.current = value;
          }}
        />
        <div style={{ marginTop: "10px", display: "flex" }}>
          <Button
            style={{ marginRight: "5px" }}
            onClick={() => {
              props.actions?.set_editing(message, false);
              props.actions?.delete_draft(date);
            }}
          >
            Cancel
          </Button>
          <Button type="primary" onClick={saveEditedMessage}>
            <Icon name="save" /> Save Edited Message
          </Button>
        </div>
      </div>
    );
  }

  function sendReply(reply?: string) {
    if (props.actions == null) return;
    setReplying(false);
    if (!reply) {
      reply = replyMentionsRef.current?.() ?? replyMessageRef.current;
    }
    props.actions.send_reply({ message: message.toJS(), reply });
    props.actions.scrollToBottom(props.index);
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
    const replyDate = -(props.actions.store?.getThreadRootDate(date) ?? 0);
    return (
      <div style={{ marginLeft: mode === "standalone" ? "30px" : "0" }}>
        <ChatInput
          autoFocus={autoFocusReply}
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
          date={replyDate}
          onChange={(value) => {
            replyMessageRef.current = value;
            // replyMentionsRef does not submit mentions, only gives us the value
            const reply = replyMentionsRef.current?.(undefined, true) ?? value;
            props.actions?.llm_estimate_cost(reply, "reply", message.toJS());
          }}
          placeholder={"Reply to the above message..."}
        />
        <div style={{ margin: "5px 0", display: "flex" }}>
          <Button
            style={{ marginRight: "5px" }}
            onClick={() => {
              setReplying(false);
              props.actions?.delete_draft(replyDate);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              sendReply();
            }}
            type="primary"
          >
            <Icon name="paper-plane" /> Send
          </Button>
          <LLMCostEstimationChat
            llm_cost={llm_cost_reply}
            compact={false}
            style={{ display: "inline-block", marginLeft: "10px" }}
          />
        </div>
      </div>
    );
  }

  function getStyleBase(): CSS {
    if (!is_thread_body) {
      if (is_thread) {
        if (is_folded) {
          return THREAD_STYLE_FOLDED;
        } else {
          return THREAD_STYLE_TOP;
        }
      } else {
        return TRHEAD_STYLE_SINGLE;
      }
    } else if (props.allowReply) {
      return THREAD_STYLE_BOTTOM;
    } else {
      return THREAD_STYLE;
    }
  }

  function getStyle(): CSS {
    switch (mode) {
      case "standalone":
        return getStyleBase();
      case "sidechat":
        return {
          ...getStyleBase(),
          marginLeft: "5px",
          marginRight: "5px",
          paddingLeft: "0",
        };
      default:
        unreachable(mode);
        return getStyleBase();
    }
  }

  function renderReplyRow() {
    if (replying || generating || !props.allowReply || is_folded) return;

    return (
      <div style={{ textAlign: "center", marginBottom: "5px", width: "100%" }}>
        <Tooltip
          title={
            isLLMThread
              ? `Reply to ${modelToName(
                  isLLMThread,
                )}, sending the entire thread as context.`
              : "Reply in this thread."
          }
        >
          <Button
            type="text"
            onClick={() => {
              setReplying(true);
              setAutoFocusReply(true);
            }}
            style={{ color: COLORS.GRAY_M }}
          >
            <Icon name="reply" /> Reply
            {isLLMThread ? ` to ${modelToName(isLLMThread)}` : ""}
            {isLLMThread ? (
              <Avatar
                account_id={isLLMThread}
                size={16}
                style={{ top: "-5px" }}
              />
            ) : undefined}
          </Button>
        </Tooltip>
        {showAISummarize && is_thread ? (
          <SummarizeThread message={message} actions={props.actions} />
        ) : undefined}
      </div>
    );
  }

  function renderFoldedRow() {
    if (!is_folded || !is_thread || is_thread_body) return;

    return (
      <Col xs={24}>
        <Paragraph type="secondary" style={{ textAlign: "center" }}>
          {mode === "standalone" ? "This thread is folded. " : ""}
          <Button
            type="text"
            icon={<Icon name="down-circle-o" />}
            onClick={() =>
              props.actions?.foldThread(message.get("date"), props.index)
            }
          >
            <Text type="secondary">Unfold</Text>
          </Button>
        </Paragraph>
      </Col>
    );
  }

  function getThreadfoldOrBlank() {
    const xs = 2;
    if (is_thread_body || (!is_thread_body && !is_thread)) {
      return BLANK_COLUMN(xs);
    } else {
      const style: CSS =
        mode === "standalone"
          ? {
              marginTop: MARGIN_TOP_VIEWER,
              marginLeft: "5px",
              marginRight: "5px",
            }
          : { marginTop: "5px", width: "100%", textAlign: "center" };
      const iconname = is_folded
        ? mode === "standalone"
          ? reverseRowOrdering
            ? "right-circle-o"
            : "left-circle-o"
          : "right-circle-o"
        : "down-circle-o";
      const button = (
        <Button
          type="text"
          style={style}
          disabled={force_unfold}
          onClick={() =>
            props.actions?.foldThread(message.get("date"), props.index)
          }
          icon={
            <Icon
              name={iconname}
              style={{ fontSize: mode === "standalone" ? "22px" : "18px" }}
            />
          }
        />
      );
      return (
        <Col
          xs={xs}
          key={"blankcolumn"}
          style={{ textAlign: reverseRowOrdering ? "left" : "right" }}
        >
          {true || hideTooltip ? (
            button
          ) : (
            <Tooltip
              title={
                is_folded
                  ? "Unfold this thread"
                  : "Fold this thread to hide replies"
              }
            >
              {button}
            </Tooltip>
          )}
        </Col>
      );
    }
  }

  function renderCols(): JSX.Element[] | JSX.Element {
    // these columns should be filtered in the first place, this here is just an extra check
    if (is_thread && is_folded && is_thread_body) return <></>;

    switch (mode) {
      case "standalone":
        const cols = [
          avatar_column(),
          content_column(),
          getThreadfoldOrBlank(),
        ];
        if (reverseRowOrdering) {
          cols.reverse();
        }
        return cols;

      case "sidechat":
        return [getThreadfoldOrBlank(), content_column()];

      default:
        unreachable(mode);
        return content_column();
    }
  }

  return (
    <Row style={getStyle()}>
      {renderCols()}
      {renderFoldedRow()}
      {renderReplyRow()}
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
