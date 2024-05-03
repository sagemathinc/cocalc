/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import type { MenuProps } from "antd";
import {
  Button,
  Col,
  Collapse,
  Dropdown,
  Popconfirm,
  Row,
  Space,
  Switch,
  Tooltip,
} from "antd";
import { Map } from "immutable";
import { CSSProperties, useLayoutEffect } from "react";

import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import {
  CSS,
  redux,
  useAsyncEffect,
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
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { LanguageModelVendorAvatar } from "@cocalc/frontend/components/language-model-icon";
import PopconfirmKeyboard from "@cocalc/frontend/components/popconfirm-keyboard";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import { IS_TOUCH } from "@cocalc/frontend/feature";
import LLMSelector, {
  LLMModelPrice,
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { useProjectContext } from "@cocalc/frontend/project/context";
import {
  CoreLanguageModel,
  USER_SELECTABLE_LLMS_BY_VENDOR,
  isLanguageModelService,
  toOllamaModel,
} from "@cocalc/util/db-schema/llm-utils";
import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { OllamaPublic } from "@cocalc/util/types/llm";
import { RawPrompt } from "../jupyter/llm/raw-prompt";
import { ChatActions } from "./actions";
import { getUserName } from "./chat-log";
import { History, HistoryFooter, HistoryTitle } from "./history";
import ChatInput from "./input";
import { LLMCostEstimationChat } from "./llm-cost-estimation";
import { Name } from "./name";
import { Time } from "./time";
import { ChatMessageTyped, Mode } from "./types";
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

  set_scroll?: Function;
  scroll_into_view: () => void; // call to scroll this message into view

  // if true, include a reply button - this should only be for messages
  // that don't have an existing reply to them already.
  allowReply?: boolean;

  is_thread?: boolean; // if true, there is a thread starting in a reply_to message
  is_folded?: boolean; // if true, only show the reply_to root message
  is_thread_body: boolean;

  llm_cost_reply?: [number, number] | null;
}

export default function Message(props: Props) {
  const { is_thread, is_folded, is_thread_body, mode, llm_cost_reply } = props;

  const hideTooltip =
    useTypedRedux("account", "other_settings").get("hide_file_popovers") ??
    false;

  const [edited_message, set_edited_message] = useState<string>(
    newest_content(props.message),
  );
  // We have to use a ref because of trickiness involving
  // stale closures when submitting the message.
  const edited_message_ref = useRef(edited_message);

  const [show_history, set_show_history] = useState(false);

  const new_changes = useMemo(
    () => edited_message !== newest_content(props.message),
    [props.message] /* note -- edited_message is a function of props.message */,
  );

  // date as ms since epoch or 0
  const date: number = useMemo(() => {
    return props.message?.get("date")?.valueOf() ?? 0;
  }, [props.message.get("date")]);

  const generating = props.message.get("generating");

  const history_size = useMemo(
    () => props.message.get("history").size,
    [props.message],
  );

  const isEditing = useMemo(
    () => is_editing(props.message, props.account_id),
    [props.message, props.account_id],
  );

  const editor_name = useMemo(() => {
    return props.get_user_name(
      props.message.get("history")?.first()?.get("author_id"),
    );
  }, [props.message]);

  const isFolded: boolean = useMemo(() => {
    return props.message.get("folding")?.includes(props.account_id) ?? false;
  }, [props.message]);

  const reverseRowOrdering =
    !is_thread_body && sender_is_viewer(props.account_id, props.message);

  const submitMentionsRef = useRef<Function>();

  const [replying, setReplying] = useState<boolean>(false);

  const replyMessageRef = useRef<string>("");
  const replyMentionsRef = useRef<Function>();

  const is_viewers_message = sender_is_viewer(props.account_id, props.message);
  const verb = show_history ? "Hide" : "Show";

  const isLLMThread = useMemo(
    () => props.actions?.isLanguageModelThread(props.message.get("date")),
    [props.message, props.actions != null],
  );

  const msgWrittenByLLM = useMemo(() => {
    const author_id = props.message.get("history")?.first()?.get("author_id");
    return typeof author_id === "string" && isLanguageModelService(author_id);
  }, [props.message]);

  useLayoutEffect(() => {
    if (replying) {
      props.scroll_into_view();
    }
  }, [replying]);

  function editing_status(is_editing: boolean) {
    let text;
    const other_editors = props.message
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
          other_editors.first(),
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
      const msg_date = props.message.get("history").first()?.get("date");
      return (
        <div
          style={{
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
      <div>
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
    props.actions.set_editing(props.message, true);
    props.scroll_into_view();
  }

  function avatar_column() {
    const sender_id = props.message.get("sender_id");
    let style: CSSProperties = {};
    if (!props.is_prev_sender) {
      style.marginTop = "22px";
    } else {
      style.marginTop = "5px";
    }

    if (!is_thread_body) {
      if (sender_is_viewer(props.account_id, props.message)) {
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
    let value = newest_content(props.message);

    const { background, color, lighten, message_class } = message_colors(
      props.account_id,
      props.message,
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

    return (
      <Col key={1} xs={mainXS}>
        <div style={{ display: "flex" }}>
          {!props.is_prev_sender &&
          !is_viewers_message &&
          props.message.get("sender_id") ? (
            <Name
              sender_name={props.get_user_name(props.message.get("sender_id"))}
            />
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
                {Date.now() - date < SHOW_EDIT_BUTTON_MS && (
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
                      onClick={() =>
                        props.actions?.set_editing(props.message, true)
                      }
                    >
                      <Icon name="pencil" /> Edit
                    </Button>
                  </Tooltip>
                )}
                {DELETE_BUTTON &&
                newest_content(props.message).trim().length > 0 ? (
                  <Tooltip
                    title="Delete this message. You can delete any past message by anybody.  The deleted message can be view in history."
                    placement="left"
                  >
                    <Popconfirm
                      title="Delete this message"
                      description="Are you sure you want to delete this message?"
                      onConfirm={() => {
                        props.actions?.set_editing(props.message, true);
                        setTimeout(
                          () => props.actions?.send_edit(props.message, ""),
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
                {/* {!is_thread_body && props.allowReply && !replying ? (
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
                ) : undefined} */}
                {props.message.get("history").size > 1 ||
                props.message.get("editing").size > 0
                  ? editing_status(isEditing)
                  : undefined}
                {props.message.get("history").size > 1 ? (
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
                ) : undefined}
                {isLLMThread && msgWrittenByLLM ? (
                  <RegenerateLLM actions={props.actions} date={date} />
                ) : undefined}
              </Space>
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
        {replying ? renderComposeReply() : undefined}
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
    props.actions.send_reply({ message: props.message.toJS(), reply });
    props.actions.scrollToBottom(props.index);
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
      <div style={{ marginLeft: mode === "standalone" ? "30px" : "0" }}>
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
            const reply = replyMentionsRef.current?.() ?? value;
            props.actions?.llm_estimate_cost(
              reply,
              "reply",
              props.message.toJS(),
            );
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
        if (isFolded) {
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
            onClick={() => setReplying(true)}
            style={{ color: COLORS.GRAY_M }}
          >
            <Icon name="reply" /> Reply
            {isLLMThread ? ` to ${modelToName(isLLMThread)}` : ""}
            {isLLMThread ? (
              <Avatar
                account_id={isLLMThread}
                size={16}
                style={{ marginLeft: "10px", marginBottom: "2.5px" }}
              />
            ) : undefined}
          </Button>
        </Tooltip>
        {props.message.get("reply_to") != null ? (
          <SummarizeThread message={props.message} actions={props.actions} />
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
              props.actions?.foldThread(props.message.get("date"), props.index)
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
              marginTop:
                props.show_avatar ||
                (!props.is_prev_sender && is_viewers_message)
                  ? MARGIN_TOP_VIEWER
                  : "5px",
              marginLeft: "5px",
              marginRight: "5px",
            }
          : { marginTop: "5px", width: "100%", textAlign: "center" };
      const iconname = isFolded
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
          onClick={() =>
            props.actions?.foldThread(props.message.get("date"), props.index)
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
                isFolded
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

interface RegenerateLLMProps {
  actions?: ChatActions;
  date: number; // ms since epoch
  style?: CSS;
}

function RegenerateLLM({ actions, date, style }: RegenerateLLMProps) {
  const { enabledLLMs } = useProjectContext();
  const selectableLLMs = useTypedRedux("customize", "selectable_llms");
  const ollama = useTypedRedux("customize", "ollama");

  if (!actions) return null;

  const entries: MenuProps["items"] = [];

  // iterate over all key,values in USER_SELECTABLE_LLMS_BY_VENDOR
  for (const vendor in USER_SELECTABLE_LLMS_BY_VENDOR) {
    if (!enabledLLMs[vendor]) continue;
    const llms: CoreLanguageModel[] = USER_SELECTABLE_LLMS_BY_VENDOR[vendor];
    for (const llm of llms) {
      if (!selectableLLMs.includes(llm)) continue;
      entries.push({
        key: llm,
        label: (
          <>
            <LanguageModelVendorAvatar model={llm} /> {modelToName(llm)}{" "}
            <LLMModelPrice model={llm} floatRight />
          </>
        ),
        onClick: () => {
          actions.regenerateLLMResponse(new Date(date), llm);
        },
      });
    }
  }

  if (ollama) {
    for (const [key, config] of Object.entries<OllamaPublic>(ollama.toJS())) {
      const { display } = config;
      const ollamaModel = toOllamaModel(key);
      entries.push({
        key: ollamaModel,
        label: (
          <>
            <LanguageModelVendorAvatar model={ollamaModel} /> {display}{" "}
            <LLMModelPrice model={ollamaModel} floatRight />
          </>
        ),
        onClick: () => {
          actions.regenerateLLMResponse(new Date(date), ollamaModel);
        },
      });
    }
  }

  return (
    <Tooltip title="Regenerating the response will send the thread to the language model again and replace this answer. Select a different language model to see, if it has a better response. Previous answers are kept in the history of that message.">
      <Dropdown
        menu={{
          items: entries,
          style: { overflow: "auto", maxHeight: "50vh" },
        }}
        trigger={["click"]}
      >
        <Button
          size="small"
          style={{ display: "inline", whiteSpace: "nowrap", ...style }}
        >
          <Space>
            <Icon name="refresh" /> Regenerate
            <Icon name="chevron-down" />
          </Space>
        </Button>
      </Dropdown>
    </Tooltip>
  );
}

function SummarizeThread({
  message,
  actions,
}: {
  message: ChatMessageTyped;
  actions?: ChatActions;
}) {
  const reply_to = message.get("reply_to");
  const { project_id } = useProjectContext();
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [visible, setVisible] = useState(false);
  const [tokens, setTokens] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [short, setShort] = useState(true);
  const [prompt, setPrompt] = useState<string>("");

  useAsyncEffect(async () => {
    // we do no do all the processing if the popconfirm is not visible
    if (!visible) return;

    const info = await actions?.summarizeThread({
      model,
      reply_to,
      returnInfo: true,
      short,
    });

    if (!info) return;
    const { tokens, truncated, prompt } = info;
    setTokens(tokens);
    setTruncated(truncated);
    setPrompt(prompt);
  }, [visible, model, message, short]);

  return (
    <PopconfirmKeyboard
      onVisibilityChange={setVisible}
      icon={<AIAvatar size={16} />}
      title={<>Summarize this thread</>}
      description={() => (
        <div style={{ maxWidth: "500px" }}>
          <Paragraph>
            <LLMSelector model={model} setModel={setModel} />
          </Paragraph>
          <Paragraph>
            The conversation in this thread will be sent to the language model{" "}
            {modelToName(model)}. It will then start a new thread and reply with
            a {short ? "short" : "detailed"} summary of the conversation.
          </Paragraph>
          <Paragraph>
            Summary lenght:{" "}
            <Switch
              checked={!short}
              onChange={(v) => setShort(!v)}
              unCheckedChildren={"short"}
              checkedChildren={"detailed"}
            />
          </Paragraph>
          {truncated ? (
            <Paragraph type="warning">
              The conversion will be truncated. Consider selecting another
              language model with a larger context window.
            </Paragraph>
          ) : null}
          <Collapse
            items={[
              {
                key: "1",
                label: (
                  <>Click to see what will be sent to {modelToName(model)}.</>
                ),
                children: (
                  <RawPrompt
                    input={prompt}
                    style={{ border: "none", padding: "0", margin: "0" }}
                  />
                ),
              },
            ]}
          />
          <LLMCostEstimation
            model={model}
            tokens={tokens}
            paragraph={true}
            type="secondary"
            maxOutputTokens={short ? 200 : undefined}
          />
        </div>
      )}
      onConfirm={() => actions?.summarizeThread({ model, reply_to, short })}
      okText="Summarize"
    >
      <Button type="text" style={{ color: COLORS.GRAY_M }}>
        <Icon name="vertical-align-middle" /> Summarize…
      </Button>
    </PopconfirmKeyboard>
  );
}
