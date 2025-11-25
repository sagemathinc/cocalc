/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore blankcolumn

import { Badge, Button, Col, Row, Tooltip } from "antd";
import { List, Map } from "immutable";
import { CSSProperties, ReactNode, useEffect, useLayoutEffect } from "react";
import { useIntl } from "react-intl";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import {
  CSS,
  redux,
  useMemo,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { Gap, Icon, TimeAgo, Tip } from "@cocalc/frontend/components";
import CopyButton from "@cocalc/frontend/components/copy-button";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import { IS_TOUCH } from "@cocalc/frontend/feature";
import { modelToName } from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { labels } from "@cocalc/frontend/i18n";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { User } from "@cocalc/frontend/users";
import { isLanguageModelService } from "@cocalc/util/db-schema/llm-utils";
import { plural, unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { ChatActions } from "./actions";
import { getUserName } from "./chat-log";
import CodexActivity from "./codex-activity";
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
  getThreadRootDate,
  is_editing,
  message_colors,
  newest_content,
  sender_is_viewer,
} from "./utils";

const BLANK_COLUMN = (xs) => <Col key={"blankcolumn"} xs={xs}></Col>;

const MARKDOWN_STYLE = undefined;

const BORDER = "2px solid #ccc";

const SHOW_EDIT_BUTTON_MS = 15000;

const THREAD_STYLE_SINGLE: CSS = {
  marginLeft: "15px",
  marginRight: "15px",
  paddingLeft: "15px",
} as const;

const THREAD_STYLE: CSS = {
  ...THREAD_STYLE_SINGLE,
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
  messages;
  message: ChatMessageTyped;
  account_id: string;
  user_map?: Map<string, any>;
  project_id?: string; // improves relative links if given
  path?: string;
  font_size?: number;
  is_prev_sender?: boolean;
  show_avatar?: boolean;
  mode: Mode;
  selectedHashtags?: Set<string>;

  scroll_into_view?: () => void; // call to scroll this message into view

  // if true, include a reply button - this should only be for messages
  // that don't have an existing reply to them already.
  allowReply?: boolean;

  is_thread?: boolean; // if true, there is a thread starting in a reply_to message
  is_folded?: boolean; // if true, only show the reply_to root message
  is_thread_body: boolean;

  costEstimate;

  selected?: boolean;

  // for the root of a folded thread, optionally give this number of a
  // more informative message to the user.
  numChildren?: number;
  threadViewMode?: boolean;
}

export default function Message({
  index,
  actions,
  get_user_name,
  messages,
  message,
  account_id,
  user_map,
  project_id,
  path,
  font_size,
  is_prev_sender,
  show_avatar,
  mode,
  selectedHashtags,
  scroll_into_view,
  allowReply,
  is_thread,
  is_folded,
  is_thread_body,
  costEstimate,
  selected,
  numChildren,
  threadViewMode = false,
}: Props) {
  const intl = useIntl();

  const showAISummarize = redux
    .getStore("projects")
    .hasLanguageModelEnabled(project_id, "chat-summarize");

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

  const showEditButton = Date.now() - date < SHOW_EDIT_BUTTON_MS;

  const generating = message.get("generating");

  const history_size = useMemo(
    () => message.get("history")?.size ?? 0,
    [message],
  );

  const isEditing = useMemo(
    () => is_editing(message, account_id),
    [message, account_id],
  );

  const editor_name = useMemo(() => {
    return get_user_name(message.get("history")?.first()?.get("author_id"));
  }, [message]);

  const reverseRowOrdering =
    !is_thread_body && sender_is_viewer(account_id, message);

  const submitMentionsRef = useRef<SubmitMentionsFn>(null as any);

  const [replying, setReplying] = useState<boolean>(() => {
    if (!allowReply) {
      return false;
    }
    const replyDate = -getThreadRootDate({ date, messages });
    const draft = actions?.syncdb?.get_one({
      event: "draft",
      sender_id: account_id,
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
    if (!allowReply) {
      setReplying(false);
    }
  }, [allowReply]);

  const [autoFocusReply, setAutoFocusReply] = useState<boolean>(false);
  const [autoFocusEdit, setAutoFocusEdit] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const replyMessageRef = useRef<string>("");
  const replyMentionsRef = useRef<SubmitMentionsFn | undefined>(undefined);

  const is_viewers_message = sender_is_viewer(account_id, message);
  const isLLMThread = useMemo(
    () => actions?.isLanguageModelThread(message.get("date")),
    [message, actions != null],
  );

  useEffect(() => {
    if (generating === true && date > 0) {
      const start = date;
      const update = () => {
        setElapsedMs(Date.now() - start);
      };
      update();
      const handle = window.setInterval(update, 1000);
      return () => window.clearInterval(handle);
    } else {
      setElapsedMs(0);
    }
  }, [generating, date]);

  const elapsedLabel = useMemo(() => {
    if (!elapsedMs || elapsedMs < 0) return "";
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${minutes}:${pad(seconds)}`;
  }, [elapsedMs]);

  const msgWrittenByLLM = useMemo(() => {
    const author_id = message.get("history")?.first()?.get("author_id");
    return typeof author_id === "string" && isLanguageModelService(author_id);
  }, [message]);

  const codexEvents = useMemo(() => {
    const ev = message.get("acp_events") ?? message.get("codex_events");
    if (!ev) return undefined;
    // Immutable.js collections have toJS
    if (typeof (ev as any)?.toJS === "function") {
      return (ev as any).toJS();
    }
    return ev;
  }, [message]);

  const codexThreadId = useMemo(() => {
    return (
      message.get("acp_thread_id") ??
      message.get("codex_thread_id") ??
      undefined
    );
  }, [message]);

  const isActive =
    selected || isHovered || replying || show_history || isEditing;

  useLayoutEffect(() => {
    if (replying) {
      scroll_into_view?.();
    }
  }, [replying]);

  function render_editing_status(is_editing: boolean) {
    let text;

    let other_editors = // @ts-ignore -- keySeq *is* a method of TypedMap
      message.get("editing")?.remove(account_id).keySeq() ?? List();
    if (is_editing) {
      if (other_editors.size === 1) {
        // This user and someone else is also editing
        text = (
          <>
            {`WARNING: ${get_user_name(
              other_editors.first(),
            )} is also editing this! `}
            <b>Simultaneous editing of messages is not supported.</b>
          </>
        );
      } else if (other_editors.size > 1) {
        // Multiple other editors
        text = `${other_editors.size} other users are also editing this!`;
      } else if (
        history_size !== (message.get("history")?.size ?? 0) &&
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
        text = `${get_user_name(
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
    if (project_id == null || path == null || actions == null) {
      // no editing functionality or not in a project with a path.
      return;
    }
    actions.setEditing(message, true);
    setAutoFocusEdit(true);
    scroll_into_view?.();
  }

  function avatar_column() {
    const sender_id = message.get("sender_id");
    let style: CSSProperties = {};
    if (!is_prev_sender) {
      style.marginTop = "22px";
    } else {
      style.marginTop = "5px";
    }

    if (!is_thread_body) {
      if (sender_is_viewer(account_id, message)) {
        style.marginLeft = AVATAR_MARGIN_LEFTRIGHT;
      } else {
        style.marginRight = AVATAR_MARGIN_LEFTRIGHT;
      }
    }

    return (
      <Col key={0} xs={2}>
        <div style={style}>
          {sender_id != null && show_avatar ? (
            <Avatar size={40} account_id={sender_id} />
          ) : undefined}
        </div>
      </Col>
    );
  }

  function renderCopyMessageButton() {
    return (
      <Tip
        placement={"top"}
        title={intl.formatMessage({
          id: "chat.message.copy_markdown.tooltip",
          defaultMessage: "Copy message as markdown",
          description:
            "Tooltip for button to copy chat message as markdown text",
        })}
      >
        <CopyButton
          value={message_to_markdown(message)}
          size="small"
          noText={true}
          style={{
            //color: is_viewers_message ? "white" : "#888",
            fontSize: "12px",
            marginTop: "-4px",
          }}
        />
      </Tip>
    );
  }

  function renderLinkMessageButton() {
    return (
      <Tip
        placement={"top"}
        title={intl.formatMessage({
          id: "chat.message.copy_link.tooltip",
          defaultMessage: "Select message. Copy URL to link to this message.",
          description:
            "Tooltip for button to copy URL link to specific chat message",
        })}
      >
        <Button
          onClick={() => {
            actions?.setFragment(message.get("date"));
          }}
          size="small"
          type={"text"}
          style={{
            //color: is_viewers_message ? "white" : "#888",
            fontSize: "12px",
            marginTop: "-4px",
          }}
        >
          <Icon name="link" />
        </Button>
      </Tip>
    );
  }

  function renderLLMFeedbackButtons() {
    if (isLLMThread) return;

    const feedback = message.getIn(["feedback", account_id]);
    const otherFeedback =
      isLLMThread && msgWrittenByLLM ? 0 : (message.get("feedback")?.size ?? 0);
    const showOtherFeedback = otherFeedback > 0;

    const iconColor = showOtherFeedback ? "darkblue" : COLORS.GRAY_D;
    return (
      <Tip
        placement={"top"}
        title={
          !showOtherFeedback
            ? "Like this"
            : () => {
                return (
                  <div>
                    {Object.keys(message.get("feedback")?.toJS() ?? {}).map(
                      (account_id) => (
                        <div key={account_id} style={{ marginBottom: "2px" }}>
                          <Avatar size={24} account_id={account_id} />{" "}
                          <User account_id={account_id} />
                        </div>
                      ),
                    )}
                  </div>
                );
              }
        }
      >
        <Button
          size="small"
          type={feedback ? "dashed" : "text"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            color: iconColor,
          }}
          onClick={() => {
            actions?.feedback(message, feedback ? null : "positive");
          }}
        >
          {showOtherFeedback ? (
            <Badge count={otherFeedback} color="darkblue" size="small">
              <Icon
                name="thumbs-up"
                style={{ color: "darkblue", fontSize: 14 }}
              />
            </Badge>
          ) : (
            <Icon name="thumbs-up" style={{ fontSize: 14, color: iconColor }} />
          )}
        </Button>
      </Tip>
    );
  }

  function renderMessageHeader(lighten) {
    const headerActions = renderHeaderActions();
    return (
      <div
        style={{
          ...lighten,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "4px",
          gap: "10px",
        }}
      >
        <Time message={message} edit={edit_message} />
        {headerActions}
      </div>
    );
  }

  function renderHeaderActions() {
    const showActions = IS_TOUCH || isActive;
    const buttons: ReactNode[] = [];

    const llmFeedbackButton = renderLLMFeedbackButtons();
    if (llmFeedbackButton) {
      buttons.push(<span key="like">{llmFeedbackButton}</span>);
    }
    buttons.push(<span key="copy">{renderCopyMessageButton()}</span>);
    buttons.push(<span key="link">{renderLinkMessageButton()}</span>);

    if (allowReply && !replying && actions) {
      buttons.push(
        <Tooltip
          key="reply"
          placement="bottom"
          title={
            isLLMThread
              ? `Reply to ${modelToName(
                  isLLMThread,
                )}, sending the thread as context.`
              : "Reply to this thread."
          }
        >
          <Button
            type="text"
            size="small"
            style={{ color: COLORS.GRAY_M }}
            onClick={() => {
              setReplying(true);
              setAutoFocusReply(true);
            }}
          >
            <Icon name="reply" /> Reply
            {isLLMThread ? ` to ${modelToName(isLLMThread)}` : ""}
            {isLLMThread ? (
              <Avatar
                account_id={isLLMThread}
                size={16}
                style={{ top: "-2px", marginLeft: "4px" }}
              />
            ) : null}
          </Button>
        </Tooltip>,
      );
    }

    if (showAISummarize && is_thread && !threadViewMode) {
      buttons.push(
        <span key="summarize">
          <SummarizeThread message={message} actions={actions} />
        </span>,
      );
    }

    if (is_thread && !threadViewMode) {
      buttons.push(
        <Tooltip
          key="fold"
          placement="bottom"
          title={
            is_folded
              ? "Unfold this thread to show replies."
              : "Fold this thread to hide replies."
          }
        >
          <Button
            type="text"
            size="small"
            style={{ color: COLORS.GRAY_M }}
            onClick={() =>
              actions?.toggleFoldThread(
                new Date(getThreadRootDate({ date, messages })),
                index,
              )
            }
          >
            <Icon name={is_folded ? "expand" : "vertical-align-middle"} />{" "}
            {is_folded ? "Unfold" : "Fold"}
          </Button>
        </Tooltip>,
      );
    }

    const historySize = message.get("history")?.size ?? 0;
    if (historySize > 1) {
      buttons.push(
        <Tip
          key="history"
          title="Message History"
          tip={`${show_history ? "Hide" : "Show"} history of edits.`}
        >
          <Button
            size="small"
            type={show_history ? "primary" : "text"}
            icon={<Icon name="history" />}
            onClick={() => {
              set_show_history(!show_history);
              scroll_into_view?.();
            }}
          >
            {show_history ? "Hide" : "History"}
          </Button>
        </Tip>,
      );
    }

    if (showEditButton) {
      buttons.push(
        <Tip
          key="edit"
          title={
            <>
              Edit this message. You can edit <b>any</b> past message at any
              time by double clicking on it. Fix other people's typos. All
              versions are stored.
            </>
          }
          placement="bottom"
        >
          <Button
            size="small"
            type="text"
            style={{ color: COLORS.GRAY_M }}
            onClick={() => actions?.setEditing(message, true)}
          >
            <Icon name="pencil" /> Edit
          </Button>
        </Tip>,
      );
    }

    if (isLLMThread && msgWrittenByLLM) {
      buttons.push(
        <span key="regenerate">
          <RegenerateLLM
            actions={actions}
            date={date}
            model={isLLMThread}
          />
        </span>,
      );
      buttons.push(
        <span key="feedback-llm">
          <FeedbackLLM actions={actions} message={message} />
        </span>,
      );
    }

    if (!buttons.length) {
      return null;
    }

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          opacity: showActions ? 1 : 0,
          pointerEvents: showActions ? undefined : "none",
          transition: "opacity 120ms ease",
        }}
      >
        {buttons}
      </div>
    );
  }

  function renderMessageBody({ message_class }) {
    const value = newest_content(message);

    return (
      <>
        <MostlyStaticMarkdown
          style={MARKDOWN_STYLE}
          value={value}
          className={message_class}
          selectedHashtags={selectedHashtags}
          toggleHashtag={
            selectedHashtags != null && actions != null
              ? (tag) =>
                  actions?.setHashtagState(
                    tag,
                    selectedHashtags?.has(tag) ? undefined : 1,
                  )
              : undefined
          }
        />
        {codexEvents?.length ? (
          <CodexActivity
            events={codexEvents}
            threadId={codexThreadId}
            generating={generating === true}
            canResolveApproval={
              message.get("acp_account_id") === account_id ||
              isLanguageModelService(message.get("sender_id")) ||
              is_viewers_message
            }
            onResolveApproval={
              actions && typeof actions.resolveAcpApproval === "function"
                ? ({ approvalId, optionId }) =>
                    actions.resolveAcpApproval({
                      date: message.get("date"),
                      approvalId,
                      optionId,
                    })
                : undefined
            }
          />
        ) : null}
      </>
    );
  }


  function renderEditingMeta() {
    if (isEditing) {
      return null;
    }
    const showEditingStatus =
      (message.get("history")?.size ?? 0) > 1 ||
      (message.get("editing")?.size ?? 0) > 0;
    if (!showEditingStatus) {
      return null;
    }
    return (
      <div style={{ marginTop: "6px" }}>
        {render_editing_status(isEditing)}
      </div>
    );
  }

  function renderBottomControls() {
    if (generating !== true || actions == null) {
      return null;
    }
    return (
      <div
        style={{
          marginTop: "8px",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
          color: COLORS.GRAY_M,
        }}
      >
        <Button
          size="small"
          style={{ color: COLORS.GRAY_M }}
          onClick={() => {
            actions?.languageModelStopGenerating(new Date(date));
          }}
        >
          <Icon name="square" /> Stop Generating
        </Button>
        {elapsedLabel ? (
          <span style={{ fontSize: 12, display: "inline-flex", gap: "4px" }}>
            <Icon name="clock" /> {elapsedLabel}
          </span>
        ) : null}
      </div>
    );
  }

  function contentColumn() {
    const mainXS = mode === "standalone" ? 20 : 22;

    const { background, color, lighten, message_class } = message_colors(
      account_id,
      message,
    );

    const marginTop =
      !is_prev_sender && is_viewers_message ? MARGIN_TOP_VIEWER : "5px";

    const padding = selected
      ? { paddingTop: 6, paddingLeft: 6, paddingRight: 6 }
      : { paddingTop: 9, paddingLeft: 9, paddingRight: 9 };
    const baseBottomPadding = selected ? 6 : 9;
    const messageStyle: CSSProperties = {
      color,
      background,
      wordWrap: "break-word",
      borderRadius: "5px",
      marginTop,
      fontSize: `${font_size}px`,
      paddingBottom: baseBottomPadding,
      ...padding,
      ...(mode === "sidechat"
        ? { marginLeft: "5px", marginRight: "5px" }
        : undefined),
      ...(selected ? { border: "3px solid #66bb6a" } : undefined),
    } as const;

    return (
      <Col key={1} xs={mainXS}>
        <div
          style={{ display: "flex" }}
          onClick={() => {
            actions?.setFragment(message.get("date"));
          }}
        >
          {!is_prev_sender &&
          !is_viewers_message &&
          message.get("sender_id") ? (
            <Name sender_name={get_user_name(message.get("sender_id"))} />
          ) : undefined}
        </div>
        <div
          style={messageStyle}
          className="smc-chat-message"
          onDoubleClick={edit_message}
        >
          {renderMessageHeader(lighten)}
          {isEditing
            ? renderEditMessage()
            : renderMessageBody({ message_class })}
          {renderEditingMeta()}
          {renderBottomControls()}
        </div>
        {renderHistory()}
        {renderComposeReply()}
      </Col>
    );
  }

  function renderHistory() {
    if (!show_history) return;
    return (
      <div>
        <HistoryTitle />
        <History history={message.get("history")} user_map={user_map} />
        <HistoryFooter />
      </div>
    );
  }

  function saveEditedMessage(): void {
    if (actions == null) return;
    const mesg =
      submitMentionsRef.current?.({ chat: `${date}` }) ??
      edited_message_ref.current;
    const value = newest_content(message);
    if (mesg !== value) {
      set_edited_message(mesg);
      actions.sendEdit(message, mesg);
    } else {
      actions.setEditing(message, false);
    }
  }

  function on_cancel(): void {
    set_edited_message(newest_content(message));
    if (actions == null) return;
    actions.setEditing(message, false);
    actions.deleteDraft(date);
  }

  function renderEditMessage() {
    if (project_id == null || path == null || actions?.syncdb == null) {
      // should never get into this position
      // when null.
      return;
    }
    return (
      <div>
        <ChatInput
          fontSize={font_size}
          autoFocus={autoFocusEdit}
          cacheId={`${path}${project_id}${date}`}
          input={newest_content(message)}
          submitMentionsRef={submitMentionsRef}
          on_send={saveEditedMessage}
          height={"auto"}
          syncdb={actions.syncdb}
          date={date}
          onChange={(value) => {
            edited_message_ref.current = value;
          }}
        />
        <div style={{ marginTop: "10px", display: "flex" }}>
          <Button
            style={{ marginRight: "5px" }}
            onClick={() => {
              actions?.setEditing(message, false);
              actions?.deleteDraft(date);
            }}
          >
            {intl.formatMessage(labels.cancel)}
          </Button>
          <Button type="primary" onClick={saveEditedMessage}>
            <Icon name="save" /> Save Edited Message
          </Button>
        </div>
      </div>
    );
  }

  function sendReply(reply?: string) {
    if (actions == null) return;
    setReplying(false);
    if (!reply && !replyMentionsRef.current?.(undefined, true)) {
      reply = replyMessageRef.current;
    }
    actions.sendReply({
      message: message.toJS(),
      reply,
      submitMentionsRef: replyMentionsRef,
    });
    actions.scrollToIndex(index);
  }

  function renderComposeReply() {
    if (!replying) return;

    if (project_id == null || path == null || actions?.syncdb == null) {
      // should never get into this position
      // when null.
      return;
    }

    const replyDate = -getThreadRootDate({ date, messages });
    let input;
    let moveCursorToEndOfLine = false;
    if (isLLMThread) {
      input = "";
    } else {
      const replying_to = message.get("history")?.first()?.get("author_id");
      if (!replying_to || replying_to == account_id) {
        input = "";
      } else {
        input = `<span class="user-mention" account-id=${replying_to} >@${editor_name}</span> `;
        moveCursorToEndOfLine = autoFocusReply;
      }
    }
    return (
      <div style={{ marginLeft: mode === "standalone" ? "30px" : "0" }}>
        <ChatInput
          fontSize={font_size}
          autoFocus={autoFocusReply}
          moveCursorToEndOfLine={moveCursorToEndOfLine}
          style={{
            borderRadius: "8px",
            height: "auto" /* for some reason the default 100% breaks things */,
          }}
          cacheId={`${path}${project_id}${date}-reply`}
          input={input}
          submitMentionsRef={replyMentionsRef}
          on_send={sendReply}
          height={"auto"}
          syncdb={actions.syncdb}
          date={replyDate}
          onChange={(value) => {
            replyMessageRef.current = value;
            // replyMentionsRef does not submit mentions, only gives us the value
            const input = replyMentionsRef.current?.(undefined, true) ?? value;
            actions?.llmEstimateCost({
              date: replyDate,
              input,
              message: message.toJS(),
            });
          }}
          placeholder={"Reply to the above message..."}
        />
        <div style={{ margin: "5px 0", display: "flex" }}>
          <Button
            style={{ marginRight: "5px" }}
            onClick={() => {
              setReplying(false);
              actions?.deleteDraft(replyDate);
            }}
          >
            <CancelText />
          </Button>
          <Tooltip title="Send Reply (shift+enter)">
            <Button
              onClick={() => {
                sendReply();
              }}
              type="primary"
            >
              <Icon name="reply" /> Reply
            </Button>
          </Tooltip>
          {costEstimate?.get("date") == replyDate && (
            <LLMCostEstimationChat
              costEstimate={costEstimate?.toJS()}
              compact={false}
              style={{ display: "inline-block", marginLeft: "10px" }}
            />
          )}
        </div>
      </div>
    );
  }

  function getStyleBase(): CSS {
    if (threadViewMode) {
      return THREAD_STYLE_SINGLE;
    }
    if (!is_thread_body) {
      if (is_thread) {
        if (is_folded) {
          return THREAD_STYLE_FOLDED;
        } else {
          return THREAD_STYLE_TOP;
        }
      } else {
        return THREAD_STYLE_SINGLE;
      }
    } else if (allowReply) {
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

  function renderFoldedRow() {
    if (threadViewMode || !is_folded || !is_thread || is_thread_body) {
      return;
    }

    const label = numChildren ? (
      <>
        Show {numChildren + 1} {plural(numChildren + 1, "Message", "Messages")}…
      </>
    ) : (
      "View Messages…"
    );

    return (
      <Col xs={24}>
        <Tip title={"Click to unfold this thread to show all messages."}>
          <Button
            onClick={() =>
              actions?.toggleFoldThread(message.get("date"), index)
            }
            type="link"
            block
            style={{ color: "darkblue", textAlign: "center" }}
            icon={<Icon name="expand-arrows" />}
          >
            {label}
          </Button>
        </Tip>
      </Col>
    );
  }

  function getThreadFoldOrBlank() {
    const xs = 2;
    return BLANK_COLUMN(xs);
  }

  function renderCols(): React.JSX.Element[] | React.JSX.Element {
    // these columns should be filtered in the first place, this here is just an extra check
    if (
      (!threadViewMode && is_folded) ||
      (is_thread && is_folded && is_thread_body)
    ) {
      return <></>;
    }

    switch (mode) {
      case "standalone":
        const cols = [avatar_column(), contentColumn(), getThreadFoldOrBlank()];
        if (reverseRowOrdering) {
          cols.reverse();
        }
        return cols;

      case "sidechat":
        return [getThreadFoldOrBlank(), contentColumn()];

      default:
        unreachable(mode);
        return contentColumn();
    }
  }

  return (
    <Row
      style={getStyle()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {renderCols()}
      {renderFoldedRow()}
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
