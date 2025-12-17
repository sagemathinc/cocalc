/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore blankcolumn

import { Badge, Button, Col, Drawer, Row, Tooltip } from "antd";
import {
  CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
} from "react";
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
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { labels } from "@cocalc/frontend/i18n";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { User } from "@cocalc/frontend/users";
import { isLanguageModelService } from "@cocalc/util/db-schema/llm-utils";
import { plural, unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { client_db } from "@cocalc/util/db-schema";
import { ChatActions } from "./actions";
import { getUserName } from "./chat-log";
import { codexEventsToMarkdown } from "./codex-activity";
import CodexLogPanel from "./codex-log-panel";
import { useCodexLog } from "./use-codex-log";
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
import { CONTEXT_WARN_PCT, CONTEXT_CRITICAL_PCT } from "./codex";
import { delay } from "awaiting";
import {
  dateValue,
  field,
  historyArray,
  replyTo,
  editingArray,
} from "./access";

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

const VIEWER_MESSAGE_LEFT_MARGIN = "clamp(12px, 15%, 150px)";

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
  onForceScrollToBottom?: () => void;
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
  onForceScrollToBottom,
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

  const historyEntries = useMemo(() => historyArray(message), [message]);
  const firstHistoryEntry = useMemo(
    () => (historyEntries.length > 0 ? historyEntries[0] : undefined),
    [historyEntries],
  );
  const editingState = useMemo(() => editingArray(message), [message]);

  const new_changes = useMemo(
    () => edited_message !== newest_content(message),
    [message] /* note -- edited_message is a function of message */,
  );

  // date as ms since epoch or 0
  const date: number = useMemo(() => {
    return dateValue(message)?.valueOf() ?? 0;
  }, [message]);

  const showEditButton = Date.now() - date < SHOW_EDIT_BUTTON_MS;

  const generating = field<boolean>(message, "generating");

  const history_size = historyEntries.length;

  const isEditing = useMemo(
    () => is_editing(message, account_id),
    [message, account_id],
  );

  const editor_name = useMemo(() => {
    return get_user_name(firstHistoryEntry?.author_id);
  }, [firstHistoryEntry, get_user_name]);

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
    const active =
      (draft as any)?.get?.("active") ?? (draft as any)?.active ?? undefined;
    if (typeof active === "number" && active <= 1720071100408) {
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
    () => actions?.isLanguageModelThread(dateValue(message)),
    [message, actions],
  );
  const isCodexThread =
    typeof isLLMThread === "string" && isLLMThread.includes("codex");

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
    const author_id = firstHistoryEntry?.author_id;
    return typeof author_id === "string" && isLanguageModelService(author_id);
  }, [firstHistoryEntry]);

  const acpLogInfo = useMemo(() => {
    const store = field<string>(message, "acp_log_store") ?? undefined;
    const key = field<string>(message, "acp_log_key") ?? undefined;
    const thread = field<string>(message, "acp_log_thread") ?? undefined;
    const turn = field<string>(message, "acp_log_turn") ?? undefined;
    const subject = field<string>(message, "acp_log_subject") ?? undefined;
    if (store && key) {
      return { store, key, thread, turn, subject };
    }
    return null;
  }, [message]);

  // Resolve log identifiers for this message/turn:
  // - thread: stable thread id (acp_log_thread, then acp_thread_id, then reply_to/date)
  // - turn:   per-message turn id (defaults to this message date)
  // - store:  AKV name (acp_log_store or sha1(project_id, path))
  // - key:    AKV key `${thread}:${turn}`
  // - subject: conat pub/sub subject for live log streaming
  const fallbackLogRefs = useMemo(() => {
    const thread =
      acpLogInfo?.thread ??
      field<string>(message, "acp_thread_id") ??
      replyTo(message) ??
      dateValue(message)?.toString?.();
    const turn = acpLogInfo?.turn ?? dateValue(message)?.toString?.();
    const store =
      acpLogInfo?.store ??
      (project_id && path
        ? `acp-log:${client_db.sha1(project_id, path)}`
        : undefined);
    const key =
      acpLogInfo?.key ?? (thread && turn ? `${thread}:${turn}` : undefined);
    const subject =
      acpLogInfo?.subject ??
      (project_id && thread && turn
        ? `project.${project_id}.acp-log.${thread}.${turn}`
        : undefined);
    return { thread, turn, store, key, subject };
  }, [acpLogInfo, message, project_id, path]);

  const [showCodexDrawer, setShowCodexDrawer] = useState(false);
  const codexLog = useCodexLog({
    projectId: project_id,
    logStore: fallbackLogRefs.store,
    logKey: fallbackLogRefs.key,
    logSubject: fallbackLogRefs.subject,
    generating: generating === true,
    enabled: showCodexDrawer,
  });

  const codexEvents = codexLog.events;
  const showCodexActivity = useMemo(() => {
    return Boolean(message.acp_log_subject || message.acp_log_key);
  }, [message]);

  const threadRootMs = useMemo(() => {
    const root = getThreadRootDate({ date, messages });
    const rootMs =
      root?.valueOf?.() ?? (typeof root === "number" ? root : undefined);
    if (Number.isFinite(rootMs)) return rootMs as number;
    return Number.isFinite(date) ? date : undefined;
  }, [date, messages]);

  const deleteActivityLog = useCallback(async () => {
    if (!actions?.syncdb) return;
    const d = dateValue(message);
    if (!(d instanceof Date)) return;
    await codexLog.deleteLog();
    actions.syncdb.set({
      event: "chat",
      date: d.toISOString(),
      acp_events: null,
      codex_events: null,
      acp_log_store: null,
      acp_log_key: null,
      acp_log_thread: null,
      acp_log_turn: null,
      acp_log_subject: null,
    });
    actions.syncdb.commit();
    // no local state now
  }, [actions, message, acpLogInfo, project_id]);

  const deleteAllActivityLogs = useCallback(async () => {
    if (!actions?.syncdb) return;
    const dates: Date[] = [];
    const logRefs: { store: string; key: string }[] = [];
    const rootIso =
      threadRootMs != null ? new Date(threadRootMs).toISOString() : undefined;
    if (rootIso && actions?.getMessagesInThread) {
      const seq = actions.getMessagesInThread(rootIso);
      seq?.forEach((msg) => {
        const d = dateValue(msg);
        if (!(d instanceof Date)) return;
        dates.push(d);
        const store = field<string>(msg, "acp_log_store");
        const key = field<string>(msg, "acp_log_key");
        if (store && key) {
          logRefs.push({ store, key });
        }
      });
    } else if (messages?.forEach) {
      messages.forEach((msg) => {
        const d = dateValue(msg);
        if (!(d instanceof Date)) return;
        const root = getThreadRootDate({
          date: d.valueOf(),
          messages,
        });
        const rootMs = root?.valueOf?.();
        if (rootMs != null && rootMs === threadRootMs) {
          dates.push(d);
          const store = field<string>(msg, "acp_log_store");
          const key = field<string>(msg, "acp_log_key");
          if (store && key) {
            logRefs.push({ store, key });
          }
        }
      });
    }
    if (!dates.length) {
      const d = dateValue(message);
      if (d instanceof Date) dates.push(d);
    }
    if (project_id) {
      for (const ref of logRefs) {
        try {
          const cn = webapp_client.conat_client.conat();
          const kv = cn.sync.akv({ project_id, name: ref.store });
          await kv.delete(ref.key);
        } catch (err) {
          console.warn("failed to delete acp log", err);
        }
      }
    }
    let i = 0;
    for (const d of dates) {
      i += 1;
      if (i % 20 == 0) {
        await delay(200);
      }
      actions.syncdb.set({
        event: "chat",
        date: d.toISOString(),
        acp_events: null,
        codex_events: null,
        acp_log_store: null,
        acp_log_key: null,
        acp_log_thread: null,
        acp_log_turn: null,
        acp_log_subject: null,
      });
    }
    actions.syncdb.commit();
  }, [actions, messages, threadRootMs, message, project_id]);

  const threadKeyForSession = useMemo(() => {
    return threadRootMs != null ? `${threadRootMs}` : undefined;
  }, [threadRootMs]);

  const acpThreadId = useMemo(
    () => field<string>(message, "acp_thread_id"),
    [message],
  );

  const sessionIdForInterrupt = acpThreadId ?? threadKeyForSession;

  const latestThreadMessageMs = useMemo(() => {
    if (threadRootMs == null) return null;
    const iso = new Date(threadRootMs).toISOString();
    const seq = actions?.getMessagesInThread?.(iso);
    if (seq && typeof (seq as any).toArray === "function") {
      const arr = (seq as any).toArray();
      if (arr.length > 0) {
        const last = arr[arr.length - 1];
        const lastMs = toMessageMs(dateValue(last));
        if (lastMs != null) return lastMs;
        let max = -Infinity;
        for (const msg of arr) {
          const ms = toMessageMs(dateValue(msg));
          if (ms != null && ms > max) {
            max = ms;
          }
        }
        return Number.isFinite(max) ? max : null;
      }
    }
    if (messages && typeof messages.forEach === "function") {
      let max = -Infinity;
      messages.forEach((msg) => {
        if (!msg) return;
        const root = getThreadRootDate({
          date: dateValue(msg)?.valueOf?.() ?? 0,
          messages,
        });
        const rootMs =
          root?.valueOf?.() ?? (typeof root === "number" ? root : undefined);
        if (rootMs === threadRootMs) {
          const ms = dateValue(msg)?.valueOf?.();
          if (typeof ms === "number" && Number.isFinite(ms) && ms > max) {
            max = ms;
          }
        }
      });
      return Number.isFinite(max) ? max : null;
    }
    return null;
  }, [actions, messages, threadRootMs]);

  const isLatestMessageInThread = useMemo(() => {
    if (latestThreadMessageMs == null) return true;
    return date >= latestThreadMessageMs;
  }, [latestThreadMessageMs, date]);

  const usage = useMemo(() => {
    const usageRaw: any = field(message, "acp_usage");
    if (!usageRaw) return undefined;
    return typeof usageRaw?.toJS === "function" ? usageRaw.toJS() : usageRaw;
  }, [message]);

  const remainingContext = useMemo(
    () => calcRemainingPercent(usage, isLLMThread),
    [usage, isLLMThread],
  );

  const feedbackMap = useMemo(() => field<any>(message, "feedback"), [message]);

  const isActive =
    selected || isHovered || replying || show_history || isEditing;

  useLayoutEffect(() => {
    if (replying) {
      scroll_into_view?.();
    }
  }, [replying]);

  // todo: localstorage?
  const [activitySize, setActivitySize0] = useState<number>(
    parseInt(localStorage?.acpActivitySize ?? "600"),
  );
  const setActivitySize = (size: number) => {
    setActivitySize0(size);
    try {
      localStorage.acpActivitySize = size;
    } catch {}
  };

  function render_editing_status(is_editing: boolean) {
    let text;

    const other_editors = Array.isArray(editingState)
      ? editingState.filter((id) => id !== account_id)
      : [];
    const otherCount = other_editors.length;

    if (is_editing) {
      if (otherCount === 1) {
        // This user and someone else is also editing
        text = (
          <>
            {`WARNING: ${get_user_name(other_editors[0])} is also editing this! `}
            <b>Simultaneous editing of messages is not supported.</b>
          </>
        );
      } else if (otherCount > 1) {
        // Multiple other editors
        text = `${otherCount} other users are also editing this!`;
      } else if (history_size !== historyEntries.length && new_changes) {
        text = `${editor_name} has updated this message. Esc to discard your changes and see theirs`;
      } else {
        if (IS_TOUCH) {
          text = "You are now editing ...";
        } else {
          text = "You are now editing ... Shift+Enter to submit changes.";
        }
      }
    } else {
      if (otherCount === 1) {
        // One person is editing
        text = `${get_user_name(other_editors[0])} is editing this message`;
      } else if (otherCount > 1) {
        // Multiple editors
        text = `${otherCount} people are editing this message`;
      } else if (newest_content(message).trim() === "") {
        text = `Deleted by ${editor_name}`;
      }
    }

    if (text == null) {
      text = `Last edit by ${editor_name}`;
    }

    if (
      !is_editing &&
      otherCount === 0 &&
      newest_content(message).trim() !== ""
    ) {
      const edit = "Last edit ";
      const name = ` by ${editor_name}`;
      const msg_date = firstHistoryEntry?.date;
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
    const sender_id = field<string>(message, "sender_id");
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
            const d = dateValue(message);
            if (d != null) {
              actions?.setFragment(d);
            }
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

    const feedback =
      typeof feedbackMap?.get === "function"
        ? feedbackMap.get(account_id)
        : feedbackMap?.[account_id];
    const otherFeedback =
      isLLMThread && msgWrittenByLLM
        ? 0
        : typeof feedbackMap?.size === "number"
          ? feedbackMap.size
          : Array.isArray(feedbackMap)
            ? feedbackMap.length
            : feedbackMap && typeof feedbackMap === "object"
              ? Object.keys(feedbackMap).length
              : 0;
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
                    {Object.keys(
                      typeof feedbackMap?.toJS === "function"
                        ? feedbackMap.toJS()
                        : (feedbackMap ?? {}),
                    ).map((account_id) => (
                      <div key={account_id} style={{ marginBottom: "2px" }}>
                        <Avatar size={24} account_id={account_id} />{" "}
                        <User account_id={account_id} />
                      </div>
                    ))}
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

    const historySize = history_size;
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
          <RegenerateLLM actions={actions} date={date} model={isLLMThread} />
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
        {showCodexActivity && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <Badge status={generating ? "processing" : "default"} />

              <Button
                size="small"
                onClick={() => setShowCodexDrawer(true)}
                title="View Codex activity log"
              >
                {generating
                  ? "Working"
                  : `Worked for
                ${formatTurnDuration({
                  startMs: date,
                  history: historyEntries,
                })}`}
              </Button>
              {generating ? (
                <span style={{ color: COLORS.GRAY_D }}>Live</span>
              ) : null}
            </div>

            <Drawer
              title="Codex activity"
              placement="right"
              open={showCodexDrawer}
              onClose={() => setShowCodexDrawer(false)}
              destroyOnClose
              size={activitySize}
              resizable={{
                onResize: setActivitySize,
              }}
            >
              <CodexLogPanel
                events={codexEvents ?? []}
                generating={generating === true}
                fontSize={font_size}
                persistKey={`${(project_id ?? "no-project").slice(0, 8)}:${
                  path ?? ""
                }:${date}`}
                basePath={path ? path.substring(0, path.lastIndexOf("/")) : ""}
                durationLabel={
                  generating === true
                    ? elapsedLabel
                    : formatTurnDuration({
                        startMs: date,
                        history: historyEntries,
                      })
                }
                canResolveApproval={
                  field<string>(message, "acp_account_id") === account_id ||
                  isLanguageModelService(
                    field<string>(message, "sender_id") ?? "",
                  ) ||
                  is_viewers_message
                }
                projectId={project_id}
                onResolveApproval={
                  actions && typeof actions.resolveAcpApproval === "function"
                    ? ({ approvalId, optionId }) =>
                        actions.resolveAcpApproval({
                          date: dateValue(message) ?? new Date(date),
                          approvalId,
                          optionId,
                        })
                    : undefined
                }
                onDeleteEvents={deleteActivityLog}
                onDeleteAllEvents={deleteAllActivityLogs}
              />
            </Drawer>
          </>
        )}
        {renderContextNotice()}
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
      </>
    );
  }

  function renderContextNotice() {
    if (generating === true || !usage || !isLatestMessageInThread) return null;
    const remaining = remainingContext;
    if (remaining == null || remaining > CONTEXT_WARN_PCT) return null;
    const severity =
      remaining <= CONTEXT_CRITICAL_PCT
        ? ("critical" as const)
        : ("warning" as const);
    const colors =
      severity === "critical"
        ? { bg: "rgba(211, 47, 47, 0.12)", border: "#d32f2f", text: "#b71c1c" }
        : {
            bg: "rgba(245, 166, 35, 0.12)",
            border: "#f5a623",
            text: "#8a5b00",
          };
    const rootKey =
      threadRootMs != null && Number.isFinite(threadRootMs)
        ? `${threadRootMs}`
        : `${date}`;
    const label =
      severity === "critical"
        ? "Context nearly exhausted — compact now"
        : "Context low — compact soon";
    return (
      <div
        style={{
          margin: "6px 0 8px",
          padding: "8px 10px",
          borderRadius: 6,
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          color: colors.text,
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {label} ({remaining}% left)
        </span>
        {actions?.runCodexCompact ? (
          <Button
            size="small"
            type={severity === "critical" ? "primary" : "default"}
            danger={severity === "critical"}
            onClick={() => actions.runCodexCompact(rootKey)}
          >
            Compact
          </Button>
        ) : null}
      </div>
    );
  }

  function renderEditingMeta() {
    if (isEditing) {
      return null;
    }
    const showEditingStatus =
      history_size > 1 ||
      (Array.isArray(editingState) && editingState.length > 0);
    if (!showEditingStatus) {
      return null;
    }
    return (
      <div style={{ marginTop: "6px" }}>{render_editing_status(isEditing)}</div>
    );
  }

  function renderBottomControls() {
    if (generating !== true || actions == null) {
      return null;
    }
    const interruptLabel = isCodexThread ? "Interrupt" : "Stop Generating";
    const interruptIcon = isCodexThread ? "bolt" : "square";
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
        {onForceScrollToBottom ? (
          <Button
            size="small"
            style={{ color: COLORS.GRAY_M }}
            onClick={() => onForceScrollToBottom?.()}
            title="Scroll to newest message and re-enable auto-scroll"
          >
            <Icon name="arrow-down" /> Newest
          </Button>
        ) : null}
        <Button
          size="small"
          style={{ color: COLORS.GRAY_M }}
          onClick={() => {
            actions?.languageModelStopGenerating(new Date(date), {
              threadId: sessionIdForInterrupt,
              replyTo: replyTo(message),
            });
          }}
        >
          <Icon name={interruptIcon} /> {interruptLabel}
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
      ...(is_viewers_message && mode === "standalone"
        ? { marginLeft: VIEWER_MESSAGE_LEFT_MARGIN }
        : undefined),
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
            const d = dateValue(message);
            if (d != null) actions?.setFragment(d);
          }}
        >
          {!is_prev_sender &&
          !is_viewers_message &&
          field<string>(message, "sender_id") ? (
            <Name sender_name={get_user_name(field(message, "sender_id"))} />
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
        <History history={historyEntries} user_map={user_map} />
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
      message:
        typeof (message as any)?.toJS === "function"
          ? (message as any).toJS()
          : message,
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
      const replying_to = firstHistoryEntry?.author_id;
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
              message,
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
              actions?.toggleFoldThread(
                dateValue(message) ?? new Date(date),
                index,
              )
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

function formatTurnDuration({
  startMs,
  history,
}: {
  startMs?: number;
  history?: any;
}): string {
  if (!startMs || !history) return "";
  const entries = Array.isArray(history)
    ? history
    : typeof history?.toArray === "function"
      ? history.toArray()
      : typeof history?.toJS === "function"
        ? history.toJS()
        : [];
  if (!entries.length) return "";
  const last = entries[entries.length - 1];
  const endDate =
    last?.date ??
    (typeof last?.get === "function" ? last.get("date") : undefined);
  const endMs =
    endDate instanceof Date
      ? endDate.valueOf()
      : typeof endDate === "number"
        ? endDate
        : new Date(endDate ?? 0).valueOf();
  if (!Number.isFinite(endMs) || endMs <= 0) return "";
  const elapsed = Math.max(0, endMs - startMs);
  if (!Number.isFinite(elapsed) || elapsed <= 0) return "";
  const totalSeconds = Math.floor(elapsed / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

function calcRemainingPercent(
  usage: any,
  model?: string | boolean | null,
): number | null {
  if (!usage || typeof usage !== "object") return null;
  const contextWindow =
    usage.model_context_window ??
    (typeof model === "string" ? getModelContextWindow(model) : undefined);
  const inputTokens = usage.input_tokens;
  if (
    typeof contextWindow !== "number" ||
    !Number.isFinite(contextWindow) ||
    contextWindow <= 0 ||
    typeof inputTokens !== "number" ||
    !Number.isFinite(inputTokens)
  ) {
    return null;
  }
  return Math.max(
    0,
    Math.round(((contextWindow - inputTokens) / contextWindow) * 100),
  );
}

function getModelContextWindow(model?: string): number | undefined {
  if (!model) return DEFAULT_CONTEXT_WINDOW;
  for (const [prefix, window] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (model.startsWith(prefix)) {
      return window;
    }
  }
  return DEFAULT_CONTEXT_WINDOW;
}

const DEFAULT_CONTEXT_WINDOW = 272_000;
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-5.1-codex-max": 272_000,
  "gpt-5.1-codex": 272_000,
  "gpt-5.1-codex-mini": 136_000,
  "gpt-5.1": 272_000,
};

function toMessageMs(value: any): number | null {
  if (value instanceof Date) {
    const ms = value.valueOf();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// Used for exporting chat to markdown file
export function message_to_markdown(
  message,
  options?: { includeLog?: boolean },
): string {
  const includeLog = options?.includeLog ?? false;
  let value = newest_content(message);
  const user_map = redux.getStore("users").get("user_map");
  const sender = getUserName(
    user_map,
    field<string>(message, "sender_id") ?? "",
  );
  const date = dateValue(message)?.toString() ?? "";

  if (includeLog) {
    const logMarkdown = message_codex_log_to_markdown(message);
    if (logMarkdown) {
      value = `${value}\n\n**Log**\n\n${logMarkdown}`;
    }
  }
  return `*From:* ${sender}  \n*Date:* ${date}  \n\n${value}`;
}

function message_codex_log_to_markdown(message): string {
  const events = message?.get?.("acp_events");
  if (!events) return "";
  const list = typeof events.toJS === "function" ? events.toJS() : events;
  if (!Array.isArray(list) || list.length === 0) return "";
  try {
    return codexEventsToMarkdown(list);
  } catch (err) {
    console.warn("failed to render codex log to markdown", err);
    return "";
  }
}
