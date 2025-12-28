/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { fromJS } from "immutable";
import { debounce } from "lodash";
import { setDefaultLLM } from "@cocalc/frontend/account/useLanguageModelSetting";
import { Actions, redux } from "@cocalc/frontend/app-framework";
import { History as LanguageModelHistory } from "@cocalc/frontend/client/types";
import type { BaseEditorActions as CodeEditorActions } from "@cocalc/frontend/frame-editors/base-editor/actions-base";
import {
  modelToMention,
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { open_new_tab } from "@cocalc/frontend/misc";
import Fragment from "@cocalc/frontend/misc/fragment-id";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { ImmerDB } from "@cocalc/sync/editor/immer-db";
import {
  CUSTOM_OPENAI_PREFIX,
  LANGUAGE_MODEL_PREFIXES,
  OLLAMA_PREFIX,
  USER_LLM_PREFIX,
  isLanguageModel,
  isLanguageModelService,
  model2service,
  service2model,
  toCustomOpenAIModel,
  toOllamaModel,
  type LanguageModel,
} from "@cocalc/util/db-schema/llm-utils";
import { cmp, history_path, isValidUUID } from "@cocalc/util/misc";
import { getSortedDates, getUserName } from "./chat-log";
import { message_to_markdown } from "./message";
import { ChatState, ChatStore } from "./store";
import { handleSyncDBChange, initFromSyncDB } from "./sync";
import {
  normalizeChatMessage,
  CURRENT_CHAT_MESSAGE_VERSION,
} from "./normalize";
import type {
  ChatMessage,
  ChatMessageTyped,
  Feedback,
  MessageHistory,
} from "./types";
import type { CodexThreadConfig } from "@cocalc/chat";
import { getThreadRootDate, toMsString, newest_content } from "./utils";
import type { AcpChatContext } from "@cocalc/conat/ai/acp/types";
import {
  field,
  foldingList,
  historyArray,
  dateValue,
  editingArray,
  replyTo,
  senderId,
} from "./access";
import { ChatMessageCache } from "./message-cache";
import { processLLM as processLLMExternal } from "./actions/llm";
import { addToHistory } from "@cocalc/chat";

const AUTOSAVE_INTERVAL = 15_000;

export class ChatActions extends Actions<ChatState> {
  public syncdb?: ImmerDB;
  public store?: ChatStore;
  // We use this to ensure at most once chatgpt output is streaming
  // at a time in a given chatroom.  I saw a bug where hundreds started
  // at once and it really did send them all to openai at once, and
  // this prevents that at least.
  public chatStreams: Set<string> = new Set([]);
  public frameId: string = "";
  // this might not be set e.g., for deprecated side chat on sagews:
  public frameTreeActions?: CodeEditorActions;
  // Shared message cache for this actions instance; used by both React and actions.
  public messageCache?: ChatMessageCache;

  set_syncdb = (
    syncdb: ImmerDB,
    store: ChatStore,
    messageCache: ChatMessageCache,
  ): void => {
    this.syncdb = syncdb;
    this.store = store;

    this.messageCache = messageCache;

    // trigger react subscribers to re-render when syncdb attaches
    this.store?.setState({ syncdbReady: Date.now() });

    // save periodically to disk
    this.syncdb.on("change", this.autosave);
  };

  // Read the current chat messages directly from the SyncDoc (Immer).
  getAllMessages = (): Map<string, ChatMessageTyped> => {
    if (this.messageCache) {
      return this.messageCache.getMessages();
    }
    // empty fallback since syncdb isn't defined yet
    return new Map<string, ChatMessageTyped>();
  };

  // Thread index metadata for the current chatroom.
  getThreadIndex = () => {
    if (this.messageCache) {
      return this.messageCache.getThreadIndex();
    }
    return new Map();
  };

  private toImmutableRecord(record: any): any {
    if (record == null) return null;
    return typeof record?.get === "function" ? record : fromJS(record);
  }

  private setSyncdb = (obj: any): void => {
    this.syncdb?.set(obj);
  };

  // Dispose resources tied to this actions instance.
  dispose(): void {
    // do NOT dispose of messageCache and syncdb here; that's managed
    // elsewhere.
    this.messageCache = undefined;
    this.syncdb?.removeListener("change", this.autosave);
    this.syncdb = undefined;
  }

  // Initialize the state of the store from the contents of the syncdb.
  init_from_syncdb = (): void => {
    if (this.syncdb == null) {
      return;
    }
    initFromSyncDB({ syncdb: this.syncdb, store: this.store });
  };

  syncdbChange = (changes): void => {
    if (this.syncdb == null) {
      return;
    }
    handleSyncDBChange({ changes, store: this.store, syncdb: this.syncdb });
  };

  toggleFoldThread = (reply_to: Date, messageIndex?: number) => {
    if (this.syncdb == null) return;
    const account_id = this.redux.getStore("account").get_account_id();
    const cur = this.syncdb.get_one({ event: "chat", date: reply_to });
    const folding = foldingList(cur);
    const folded = folding.includes(account_id);
    const next = folded
      ? folding.filter((x) => x !== account_id)
      : [...folding, account_id];

    const d = toISOString(reply_to);
    if (!d) {
      return;
    }
    this.setSyncdb({
      folding: next,
      date: d,
    });

    this.syncdb.commit();

    if (folded && messageIndex != null) {
      this.scrollToIndex(messageIndex);
    }
  };

  foldAllThreads = (onlyLLM = true) => {
    if (this.syncdb == null) return;
    const messages = this.getAllMessages();
    const account_id = this.redux.getStore("account").get_account_id();
    for (const [_timestamp, message] of messages) {
      const date = dateValue(message);
      // ignore replies
      if (replyTo(message) != null || !date) continue;
      const isLLMThread = this.isLanguageModelThread(date) !== false;
      if (onlyLLM && !isLLMThread) continue;
      const folding = foldingList(message);
      const folded = folding.includes(account_id);
      if (!folded) {
        this.setSyncdb({
          folding: [...folding, account_id],
          date: toISOString(date),
        });
      }
    }
  };

  feedback = (message: ChatMessageTyped, feedback: Feedback | null) => {
    if (this.syncdb == null) return;
    const date = dateValue(message);
    if (!(date instanceof Date)) return;
    const account_id = this.redux.getStore("account").get_account_id();
    const cur = this.syncdb.get_one({ event: "chat", date });
    const feedbacksRaw = field<any>(cur, "feedback");
    const feedbacks =
      typeof (feedbacksRaw as any)?.toJS === "function"
        ? (feedbacksRaw as any).toJS()
        : (feedbacksRaw ?? {});
    const next = { ...feedbacks, [account_id]: feedback };
    this.setSyncdb({ feedback: next, date });
    this.syncdb.commit();
    const model = this.isLanguageModelThread(date);
    if (isLanguageModel(model)) {
      track("llm_feedback", {
        project_id: this.store?.get("project_id"),
        path: this.store?.get("path"),
        msg_date: date,
        type: "chat",
        model: model2service(model),
        feedback,
      });
    }
  };

  // The second parameter is used for sending a message by
  // chatgpt, which is currently managed by the frontend
  // (not the project).  Also the async doesn't finish until
  // chatgpt is totally done.
  sendChat = ({
    input,
    sender_id = this.redux.getStore("account").get_account_id(),
    reply_to,
    tag,
    noNotification,
    submitMentionsRef,
    extraInput,
    name,
    preserveSelectedThread,
  }: {
    input?: string;
    sender_id?: string;
    reply_to?: Date;
    tag?: string;
    noNotification?: boolean;
    submitMentionsRef?;
    extraInput?: string;
    // if name is given, rename thread to have that name
    name?: string;
    // if true, don't switch selected thread (e.g., combined feed)
    preserveSelectedThread?: boolean;
  }): string => {
    if (this.syncdb == null || this.store == null) {
      console.warn("attempt to sendChat before chat actions initialized");
      // WARNING: give an error or try again later?
      return "";
    }
    const time_stamp: Date = webapp_client.server_time();
    const time_stamp_str = time_stamp.toISOString();
    if (submitMentionsRef?.current != null) {
      input = submitMentionsRef.current?.({ chat: `${time_stamp.valueOf()}` });
    }
    if (extraInput) {
      input = (input ?? "") + extraInput;
    }
    input = input?.trim();
    if (!input) {
      // do not send when there is nothing to send.
      return "";
    }
    const trimmedName = name?.trim();
    const message = {
      sender_id,
      event: "chat",
      schema_version: CURRENT_CHAT_MESSAGE_VERSION,
      history: [
        {
          author_id: sender_id,
          content: input,
          date: time_stamp_str,
        },
      ],
      date: time_stamp_str,
      reply_to: toISOString(reply_to),
      editing: {},
    } as ChatMessage;
    if (trimmedName && !reply_to) {
      (message as any).name = trimmedName;
    }
    this.setSyncdb(message);
    const messagesState = this.getAllMessages();
    let selectedThreadKey: string;
    if (!reply_to) {
      this.deleteDraft(0);
      if (!preserveSelectedThread) {
        this.clearAllFilters();
      }
      selectedThreadKey = `${time_stamp.valueOf()}`;
    } else {
      // when replying we make sure that the thread is expanded, since otherwise
      // our reply won't be visible
      // If the replied-to thread is folded, ensure it's expanded. In the
      // new flow we rely on the live sync doc and foldingList handles plain data.
      const replyMsg = this.syncdb?.get_one({
        event: "chat",
        date: reply_to,
      });
      const folding = foldingList(replyMsg);
      if (folding?.includes?.(sender_id)) {
        this.toggleFoldThread(reply_to);
      }
      const root =
        getThreadRootDate({
          date: reply_to.valueOf(),
          messages: messagesState,
        }) ?? reply_to.valueOf();
      selectedThreadKey = `${root}`;
    }
    if (selectedThreadKey != "0" && !preserveSelectedThread) {
      this.setSelectedThread(selectedThreadKey);
    }
    if (trimmedName && reply_to) {
      this.renameThread(selectedThreadKey, trimmedName);
    }

    const project_id = this.store?.get("project_id");
    const path = this.store?.get("path");
    if (!path) {
      throw Error("bug -- path must be defined");
    }
    // set notification saying that we sent an actual chat
    let action;
    if (
      noNotification ||
      mentionsLanguageModel(input) ||
      this.isLanguageModelThread(reply_to)
    ) {
      // Note: don't mark it is a chat if it is with chatgpt,
      // since no point in notifying all collaborators of this.
      action = "edit";
    } else {
      action = "chat";
    }
    webapp_client.mark_file({
      project_id,
      path,
      action,
      ttl: 10000,
    });
    track("send_chat", { project_id, path });

    (async () => {
      await this.processLLM({
        message,
        reply_to: reply_to ?? time_stamp,
        tag,
      });
    })();
    return time_stamp_str;
  };

  setEditing = (message: ChatMessageTyped, is_editing: boolean) => {
    if (this.syncdb == null) {
      // WARNING: give an error or try again later?
      return;
    }
    const author_id = this.redux.getStore("account").get_account_id();

    const editingIds = new Set(editingArray(message));
    if (is_editing) {
      if (editingIds.has(author_id)) {
        return;
      }
      editingIds.add(author_id);
    } else {
      if (!editingIds.has(author_id)) {
        return;
      }
      editingIds.delete(author_id);
    }

    const d = toISOString(dateValue(message));
    if (!d) {
      return;
    }
    this.setSyncdb({
      history: historyArray(message),
      editing: Array.from(editingIds),
      date: d,
    });
    // commit now so others users know this user is editing
    this.syncdb.commit();
  };

  // Used to edit sent messages.
  // NOTE: this is inefficient; it assumes
  //       the number of edits is small, which is reasonable -- nobody makes hundreds of distinct
  //       edits of a single message.
  sendEdit = (message: ChatMessageTyped, content: string): void => {
    if (this.syncdb == null) {
      // WARNING: give an error or try again later?
      return;
    }
    const author_id = this.redux.getStore("account").get_account_id();
    // OPTIMIZATION: send less data over the network?
    const date = webapp_client.server_time().toISOString();

    const d = toISOString(dateValue(message));
    if (!d) {
      return;
    }
    this.setSyncdb({
      history: addToHistory(historyArray(message) as MessageHistory[], {
        author_id,
        content,
        date,
      }),
      editing: [],
      date: d,
    });
    const draftKey = dateValue(message)?.valueOf();
    if (draftKey != null) {
      this.deleteDraft(draftKey);
    }
  };

  saveHistory = (
    message: { date: string | Date; history?: MessageHistory[] },
    content: string,
    author_id: string,
    generating: boolean = false,
  ): {
    date: string;
    prevHistory: MessageHistory[];
  } => {
    const date = toISOString(message.date);
    if (!date) {
      throw Error("invalid date");
    }
    if (this.syncdb == null) {
      return { date, prevHistory: [] };
    }
    const prevHistory: MessageHistory[] = message.history ?? [];
    this.setSyncdb({
      history: addToHistory(prevHistory, {
        author_id,
        content,
      }),
      date,
      generating,
    });
    return { date, prevHistory };
  };

  sendReply = ({
    message,
    reply,
    from,
    noNotification,
    reply_to,
    submitMentionsRef,
  }: {
    message: { date: string | Date };
    reply?: string;
    from?: string;
    noNotification?: boolean;
    reply_to?: Date;
    submitMentionsRef?;
  }): string => {
    const store = this.store;
    if (store == null) {
      return "";
    }
    // the reply_to field of the message is *always* the root.
    // the order of the replies is by timestamp.  This is meant
    // to make sure chat is just 1 layer deep, rather than a
    // full tree structure, which is powerful but too confusing.
    const reply_to_value =
      reply_to != null
        ? reply_to.valueOf()
        : getThreadRootDate({
            date: new Date(message.date).valueOf(),
            messages: this.getAllMessages(),
          });
    const time_stamp_str = this.sendChat({
      input: reply,
      submitMentionsRef,
      sender_id: from ?? this.redux.getStore("account").get_account_id(),
      reply_to: new Date(reply_to_value),
      noNotification,
    });
    // negative date of reply_to root is used for replies.
    this.deleteDraft(-reply_to_value);
    return time_stamp_str;
  };

  deleteDraft = (
    date: number,
    commit: boolean = true,
    sender_id: string | undefined = undefined,
  ) => {
    if (!this.syncdb) return;
    sender_id = sender_id ?? this.redux.getStore("account").get_account_id();
    this.syncdb.delete({
      event: "draft",
      sender_id,
      date,
    });
    if (commit) {
      this.syncdb.commit();
    }
  };

  // Make sure everything saved to DISK periodically.
  // This is not necessary, especially for side chat, but is good
  // for clear visibility of state to users and for revision control.
  save_to_disk = async (): Promise<void> => {
    if (this.syncdb?.isClosed() || this.syncdb == null) return;
    await this.syncdb.save_to_disk();
  };

  private autosave = debounce(this.save_to_disk, AUTOSAVE_INTERVAL, {
    leading: true,
    trailing: true,
  });

  // returns number of deleted messages
  // threadKey = iso timestamp root of thread.
  deleteThread = (threadKey: string): number => {
    if (this.syncdb == null) {
      return 0;
    }
    const messages = this.getAllMessages();
    const rootTarget = parseInt(`${threadKey}`);
    if (!isFinite(rootTarget)) {
      return 0;
    }
    let deleted = 0;
    for (const [_, message] of messages) {
      if (message == null) continue;
      const d = dateValue(message);
      const dateValueMs = d?.valueOf();
      const dateIso = toISOString(d);
      if (dateValueMs == null || dateIso == null) {
        continue;
      }
      const rootDate =
        getThreadRootDate({ date: dateValueMs, messages }) || dateValueMs;
      if (rootDate !== rootTarget) {
        continue;
      }
      this.syncdb.delete({ event: "chat", date: dateIso });
      deleted++;
    }
    if (deleted > 0) {
      this.syncdb.commit();
    }
    return deleted;
  };

  renameThread = (threadKey: string, name: string): boolean => {
    if (this.syncdb == null) {
      return false;
    }
    const entry = this.getThreadRootDoc(threadKey);
    if (entry == null) {
      return false;
    }
    const trimmed = name.trim();
    if (trimmed) {
      entry.doc.name = trimmed;
    } else {
      delete entry.doc.name;
    }
    this.setSyncdb(entry.doc);
    this.syncdb.commit();
    return true;
  };

  setThreadPin = (threadKey: string, pinned: boolean): boolean => {
    if (this.syncdb == null) {
      return false;
    }
    const entry = this.getThreadRootDoc(threadKey);
    if (entry == null) {
      return false;
    }
    if (pinned) {
      entry.doc.pin = true;
    } else {
      entry.doc.pin = false;
    }
    this.setSyncdb(entry.doc);
    this.syncdb.commit();
    return true;
  };

  markThreadRead = (
    threadKey: string,
    count: number,
    commit = true,
  ): boolean => {
    if (this.syncdb == null) {
      return false;
    }
    const account_id = this.redux.getStore("account").get_account_id();
    if (!account_id || !Number.isFinite(count)) {
      return false;
    }
    const entry = this.getThreadRootDoc(threadKey);
    if (entry == null) {
      return false;
    }
    entry.doc[`read-${account_id}`] = count;
    this.setSyncdb(entry.doc);
    if (commit) {
      this.syncdb.commit();
    }
    return true;
  };

  private getThreadRootDoc = (
    threadKey: string,
  ): { doc: any; message: ChatMessageTyped } | null => {
    // threadKey must be the stringified millisecond timestamp of the thread root.
    if (!/^\d+$/.test(threadKey)) {
      return null;
    }
    const messages = this.getAllMessages();
    const message = messages.get(threadKey);
    if (!message) return null;
    const dateIso = toISOString(dateValue(message));
    if (!dateIso) return null;
    const doc = { ...(message as any), date: dateIso };
    return { doc, message };
  };

  save_scroll_state = (position, height, offset): void => {
    if (height == 0) {
      // height == 0 means chat room is not rendered
      return;
    }
    this.store?.setState({ saved_position: position, height, offset });
  };

  // scroll to the bottom of the chat log
  // if date is given, scrolls to the bottom of the chat *thread*
  // that starts with that date.
  // safe to call after closing actions.
  clearScrollRequest = () => {
    this.frameTreeActions?.set_frame_data({
      id: this.frameId,
      scrollToIndex: null,
      scrollToDate: null,
    });
  };

  scrollToIndex = (index: number = -1) => {
    if (this.syncdb == null) return;
    // we first clear, then set it, since scroll to needs to
    // work even if it is the same as last time.
    // TODO: alternatively, we could get a reference
    // to virtuoso and directly control things from here.
    this.clearScrollRequest();
    setTimeout(() => {
      this.frameTreeActions?.set_frame_data({
        id: this.frameId,
        scrollToIndex: index,
        scrollToDate: null,
      });
    }, 1);
  };

  scrollToBottom = () => {
    this.scrollToIndex(Number.MAX_SAFE_INTEGER);
  };

  // this scrolls the message with given date into view and sets it as the selected message.
  scrollToDate = (date) => {
    this.clearScrollRequest();
    this.frameTreeActions?.set_frame_data({
      id: this.frameId,
      fragmentId: toMsString(date),
    });
    this.setFragment(date);
    setTimeout(() => {
      this.frameTreeActions?.set_frame_data({
        id: this.frameId,
        // string version of ms since epoch, which is the key
        // in the messages immutable Map
        scrollToDate: toMsString(date),
        scrollToIndex: null,
      });
    }, 1);
  };


  // Exports the currently visible chats to a markdown file and opens it.
  export_to_markdown = async (): Promise<void> => {
    if (!this.syncdb || !this.store) return;
    const messages = this.getAllMessages();
    const path = this.store.get("path") + ".md";
    const project_id = this.store.get("project_id");
    if (project_id == null) return;
    const account_id = this.redux.getStore("account").get_account_id();
    const { dates } = getSortedDates(messages, account_id);
    const v: string[] = [];
    for (const date of dates) {
      const message = messages.get(date);
      if (message == null) continue;
      v.push(message_to_markdown(message));
    }
    const content = v.join("\n\n---\n\n");
    await webapp_client.project_client.write_text_file({
      project_id,
      path,
      content,
    });
    this.redux
      .getProjectActions(project_id)
      .open_file({ path, foreground: true });
  };

  exportThreadToMarkdown = async ({
    threadKey,
    path,
    includeLogs = false,
  }: {
    threadKey: string;
    path: string;
    includeLogs?: boolean;
  }): Promise<void> => {
    if (!this.store) return;
    const messages = this.getAllMessages();
    if (messages == null || messages.size === 0) return;
    const project_id = this.store.get("project_id");
    if (project_id == null) return;
    const outputPath = path?.trim();
    if (!outputPath) return;

    const threadIso = threadKeyToIso(threadKey);
    if (!threadIso) return;
    const list = this.getMessagesInThread(threadIso);
    if (!list?.length) return;

    const content = list
      .map((msg) => message_to_markdown(msg, { includeLog: includeLogs }))
      .join("\n\n---\n\n");

    await webapp_client.project_client.write_text_file({
      project_id,
      path: outputPath,
      content,
    });
    this.redux
      .getProjectActions(project_id)
      .open_file({ path: outputPath, foreground: true });
  };


  help = () => {
    open_new_tab("https://doc.cocalc.com/chat.html");
  };

  undo = () => {
    this.syncdb?.undo();
  };

  redo = () => {
    this.syncdb?.redo();
  };

  /**
   * This checks a thread of messages to see if it is a language model thread and if so, returns it.
   */
  isLanguageModelThread = (date?: Date): false | LanguageModel => {
    if (date == null || this.store == null) {
      return false;
    }
    const messages = this.getAllMessages();
    if (messages == null || messages.size === 0) {
      return false;
    }
    const rootMs =
      getThreadRootDate({ date: date.valueOf(), messages }) || date.valueOf();
    const entry = this.getThreadRootDoc(`${rootMs}`);
    const rootMessage = entry?.message;
    if (rootMessage == null) {
      return false;
    }

    const cfg = field<CodexThreadConfig>(rootMessage, "acp_config");
    if (cfg?.model && cfg.model.includes("codex")) {
      return cfg.model;
    }

    const thread = this.getMessagesInThread(
      toISOString(dateValue(rootMessage)) ?? `${rootMs}`,
    );
    if (thread == null || thread.length === 0) {
      return false;
    }

    const firstMessage = thread[0];
    if (firstMessage == null) {
      return false;
    }
    const firstHistory = historyArray(firstMessage)[0];
    if (firstHistory == null) {
      return false;
    }
    const sender_id = firstHistory.author_id;
    if (isLanguageModelService(sender_id)) {
      return service2model(sender_id);
    }
    const input = firstHistory.content?.toLowerCase();
    if (mentionsLanguageModel(input)) {
      return getLanguageModel(input);
    }
    return false;
  };

  isCodexThread = (date?: Date): boolean => {
    const model = this.isLanguageModelThread(date);
    return model ? model.includes("codex") : false;
  };

  runCodexCompact = async (threadKey: string): Promise<void> => {
    if (!threadKey) {
      throw Error("runCodexCompact -- threadKey must be defined");
    }
    const reply_to = new Date(parseFloat(threadKey));
    this.sendChat({ input: "/compact", reply_to });
  };

  private processLLM = async ({
    message,
    reply_to,
    tag,
    llm,
    dateLimit,
  }: {
    message: ChatMessage;
    reply_to?: Date;
    tag?: string;
    llm?: LanguageModel;
    dateLimit?: Date; // only for regenerate, filter history
  }) => {
    if (this.syncdb == null || !this.store) {
      console.warn("processLLM called before chat actions initialized");
      return;
    }
    if (
      !tag &&
      !reply_to &&
      !redux
        .getProjectsStore()
        .hasLanguageModelEnabled(this.store?.get("project_id"))
    ) {
      return;
    }
    if (tag !== "regenerate" && !isValidUUID(message.history?.[0]?.author_id)) {
      return;
    }

    const threadModel = reply_to ? this.isLanguageModelThread(reply_to) : null;

    await processLLMExternal({
      actions: this,
      message,
      reply_to,
      tag,
      llm,
      threadModel,
      dateLimit,
    });
  };

  /**
   * @param dateStr - the ISO date of the message to get the thread for
   * @returns  - the messages in the thread, sorted by date
   */
  getMessagesInThread = (dateStr: string): ChatMessageTyped[] | undefined => {
    const messages = this.getAllMessages();
    if (!messages || messages.size === 0) return undefined;
    const list: ChatMessageTyped[] = [];
    for (const msg of messages.values()) {
      if (replyTo(msg) === dateStr || toISOString(dateValue(msg)) === dateStr) {
        list.push(msg);
      }
    }
    list.sort((a, b) =>
      cmp(dateValue(a)?.valueOf?.(), dateValue(b)?.valueOf?.()),
    );
    return list;
  };

  private saveSyncdb = async (): Promise<void> => {
    if (!this.syncdb) return;
    try {
      await this.syncdb.save();
    } catch (err) {
      console.error("chat: failed to save syncdb", err);
    }
  };

  computeThreadKey = (baseDate?: number): string | undefined => {
    if (baseDate == null || Number.isNaN(baseDate)) return undefined;
    const messagesMap = this.getAllMessages();
    if (messagesMap && messagesMap.size > 0) {
      const rootMs = getThreadRootDate({
        date: baseDate,
        messages: messagesMap,
      });
      const normalized =
        typeof rootMs === "number" && rootMs > 0 ? rootMs : baseDate;
      return `${normalized}`;
    }
    return `${baseDate}`;
  };

  // the input and output for the thread ending in the
  // given message, formatted for querying a language model, and heuristically
  // truncated to not exceed a limit in size.
  getLLMHistory = (reply_to: Date): LanguageModelHistory => {
    const history: LanguageModelHistory = [];
    // Next get all of the messages with this reply_to or that are the root of this reply chain:
    const d = toISOString(reply_to);
    if (!d) {
      return history;
    }
    const threadMessages = this.getMessagesInThread(d);
    if (!threadMessages) return history;

    for (const message of threadMessages) {
      const mostRecent = historyArray(message)[0];
      // there must be at least one history entry, otherwise the message is broken
      if (!mostRecent) continue;
      const content = stripMentions(mostRecent.content);
      // We take the message's sender ID, not the most recent version from the history
      // Why? e.g. a user could have edited an LLM message, which should still count as an LLM message
      // otherwise the forth-and-back between AI and human would be broken.
      const sender_id = senderId(message);
      const role = isLanguageModelService(sender_id) ? "assistant" : "user";
      const date = dateValue(message);
      history.push({ content, role, date });
    }
    return history;
  };

  getCodexConfig = (reply_to?: Date): CodexThreadConfig | undefined => {
    if (reply_to == null || this.store == null) return;
    const messages = this.getAllMessages();
    if (!messages) return;
    const rootMs =
      getThreadRootDate({ date: reply_to.valueOf(), messages }) ||
      reply_to.valueOf();
    const entry = this.getThreadRootDoc(`${rootMs}`);
    const rootMessage = entry?.message;
    if (!rootMessage) return;
    const cfg = field<CodexThreadConfig>(rootMessage, "acp_config");
    return cfg;
  };

  setCodexConfig = (threadKey: string, config: CodexThreadConfig): void => {
    if (this.syncdb == null) return;
    const dateNum = parseInt(threadKey, 10);
    if (!dateNum || Number.isNaN(dateNum)) {
      throw Error(`setCodexConfig: invalid threadKey ${threadKey}`);
    }
    const dateObj = new Date(dateNum);
    this.setSyncdb({
      event: "chat",
      date: dateObj.toISOString(),
      acp_config: config,
    });
    this.syncdb.commit();
    void this.saveSyncdb();
  };

  forkThread = async ({
    threadKey,
    title,
    sourceTitle,
    isAI,
  }: {
    threadKey: string;
    title: string;
    sourceTitle: string;
    isAI: boolean;
  }): Promise<string> => {
    if (!this.syncdb || !this.store) {
      throw new Error("Chat actions are not initialized");
    }
    const entry = this.getThreadRootDoc(threadKey);
    if (!entry) {
      throw new Error("Unable to locate thread root");
    }
    const rootMessage = entry.message;
    const rootDate = dateValue(rootMessage);
    const rootIso = toISOString(rootDate);
    if (!rootIso) {
      throw new Error("Invalid thread root date");
    }
    const threadMessages = this.getMessagesInThread(rootIso) ?? [];
    const latestMessage =
      threadMessages.length > 0
        ? threadMessages[threadMessages.length - 1]
        : null;
    const latestDate = latestMessage ? dateValue(latestMessage) : null;
    const latestIso = latestDate ? toISOString(latestDate) : undefined;

    let nextConfig: CodexThreadConfig | undefined = undefined;
    if (isAI) {
      const config = field<CodexThreadConfig>(rootMessage, "acp_config");
      if (config?.sessionId && this.store) {
        const project_id = this.store.get("project_id");
        if (!project_id) {
          throw new Error("Missing project id for ACP fork");
        }
        const { sessionId } = await webapp_client.conat_client.forkAcpSession({
          project_id,
          sessionId: config.sessionId,
        });
        nextConfig = { ...config, sessionId };
      } else if (config) {
        nextConfig = { ...config };
      }
    }
    if (nextConfig && !nextConfig.model) {
      nextConfig.model = "gpt-5.2-codex";
    }

    const now = webapp_client.server_time();
    const newRootIso = now.toISOString();
    const sender_id = this.redux.getStore("account").get_account_id();
    const newMessage: ChatMessage = {
      sender_id,
      event: "chat",
      schema_version: CURRENT_CHAT_MESSAGE_VERSION,
      history: [
        {
          author_id: sender_id,
          content: "",
          date: newRootIso,
        },
      ],
      date: newRootIso,
      reply_to: undefined,
      editing: [],
    };
    (newMessage as any).name = title;
    (newMessage as any).forked_from_root_date = rootIso;
    (newMessage as any).forked_from_title =
      sourceTitle?.trim() ||
      field<string>(rootMessage, "name") ||
      newest_content(rootMessage).trim() ||
      "Untitled thread";
    if (latestIso) {
      (newMessage as any).forked_from_latest_message_date = latestIso;
    }
    if (nextConfig) {
      (newMessage as any).acp_config = nextConfig;
    }

    this.setSyncdb(newMessage);
    this.syncdb.commit();
    void this.saveSyncdb();

    const newKey = `${now.valueOf()}`;
    this.setSelectedThread(newKey);
    return newKey;
  };

  languageModelStopGenerating = (
    date: Date,
    options?: { threadId?: string; replyTo?: Date | string | null },
  ) => {
    if (this.syncdb == null) return;
    this.setSyncdb({
      event: "chat",
      date: toISOString(date),
      generating: false,
    });
    this.syncdb.commit();
    void this.saveSyncdb();
    if (options?.threadId) {
      void this.requestCodexInterrupt({
        threadId: options.threadId,
        messageDate: date,
        replyTo: options.replyTo,
      });
    }
  };

  private async requestCodexInterrupt({
    threadId,
    messageDate,
    replyTo,
  }: {
    threadId: string;
    messageDate: Date;
    replyTo?: Date | string | null;
  }): Promise<void> {
    if (!threadId || !this.store) return;
    const project_id = this.store.get("project_id");
    const path = this.store.get("path");
    if (!project_id || !path) return;
    const sender_id = this.redux.getStore("account").get_account_id();
    if (!sender_id) return;
    const message_date = toISOString(messageDate);
    if (!message_date) return;
    const chat: AcpChatContext = {
      project_id,
      path,
      sender_id,
      message_date,
    };
    if (replyTo != null) {
      const reply =
        replyTo instanceof Date
          ? replyTo
          : typeof replyTo === "string"
            ? new Date(replyTo)
            : new Date(replyTo);
      if (!Number.isNaN(reply.valueOf())) {
        chat.reply_to = toISOString(reply);
      }
    }
    try {
      await webapp_client.conat_client.interruptAcp({
        project_id,
        threadId,
        chat,
      });
    } catch (err) {
      console.warn("failed to interrupt codex turn", err);
    }
  }

  resolveAcpApproval = async ({
    date,
    approvalId,
    optionId,
  }: {
    date: Date;
    approvalId: string;
    optionId?: string;
  }) => {
    void date;
    if (!approvalId) return;
    try {
      await webapp_client.conat_client.respondAcpApproval({
        approvalId,
        optionId,
      });
    } catch (err) {
      console.warn("failed to resolve ACP approval", err);
      throw err;
    }
  };

  summarizeThread = async ({
    model,
    reply_to,
    returnInfo,
    short,
  }: {
    model: LanguageModel;
    reply_to?: string;
    returnInfo?: boolean; // do not send, but return prompt + info}
    short: boolean;
  }) => {
    if (!reply_to) {
      return;
    }
    const user_map = redux.getStore("users").get("user_map");
    if (!user_map) {
      return;
    }
    const replyKey = reply_to as string;
    const threadMessages = this.getMessagesInThread(replyKey);
    if (!threadMessages) {
      return;
    }

    const history: { author: string; content: string }[] = [];
    for (const message of threadMessages) {
      const mostRecent = historyArray(message)[0];
      if (!mostRecent) continue;
      const sender_id: string = senderId(message) ?? "";
      const author = getUserName(user_map, sender_id);
      const content = stripMentions(mostRecent.content);
      history.push({ author, content });
    }

    const txtFull = [
      "<details><summary>Chat history</summary>",
      ...history.map(({ author, content }) => `${author}:\n${content}`),
      "</details>",
    ].join("\n\n");

    // do not import until needed -- it is HUGE!
    const { truncateMessage, getMaxTokens, numTokensUpperBound } = await import(
      "@cocalc/frontend/misc/llm"
    );
    const maxTokens = getMaxTokens(model);
    const txt = truncateMessage(txtFull, maxTokens);
    const m = returnInfo ? `@${modelToName(model)}` : modelToMention(model);
    const instruction = short
      ? `Briefly summarize the provided chat conversation in one paragraph`
      : `Summarize the provided chat conversation. Make a list of all topics, the main conclusions, assigned tasks, and a sentiment score.`;
    const prompt = `${m} ${instruction}:\n\n${txt}`;

    if (returnInfo) {
      const tokens = numTokensUpperBound(prompt, getMaxTokens(model));
      return { prompt, tokens, truncated: txtFull != txt };
    } else {
      this.sendChat({
        input: prompt,
        tag: `chat:summarize`,
        noNotification: true,
      });
      this.scrollToIndex();
    }
  };

  regenerateLLMResponse = async (date0: Date, llm?: LanguageModel) => {
    if (this.syncdb == null) return;
    const date = toISOString(date0);
    const obj = this.toImmutableRecord(
      this.syncdb.get_one({ event: "chat", date }),
    );
    if (obj == null) {
      return;
    }
    const { message } = normalizeChatMessage(
      (obj.toJS?.() ?? obj) as ChatMessage,
    );
    if (message == null) {
      return;
    }
    const reply_to = message.reply_to;
    if (!reply_to) return;
    await this.processLLM({
      message,
      reply_to: new Date(reply_to),
      tag: "regenerate",
      llm,
      dateLimit: date0,
    });

    if (llm != null) {
      setDefaultLLM(llm);
    }
  };

  showTimeTravelInNewTab = () => {
    const store = this.store;
    if (store == null) return;
    redux.getProjectActions(store.get("project_id")!).open_file({
      path: history_path(store.get("path")!),
      foreground: true,
      foreground_project: true,
    });
  };

  clearAllFilters = () => {
    // Filtering is no longer supported; keep this for older call sites.
  };


  setFragment = (date?) => {
    let fragmentId;
    if (!date) {
      Fragment.clear();
      fragmentId = "";
    } else {
      fragmentId = toMsString(date);
      Fragment.set({ chat: fragmentId });
    }
    this.frameTreeActions?.set_frame_data({ id: this.frameId, fragmentId });
  };

  setSelectedThread = (threadKey: string | null) => {
    this.frameTreeActions?.set_frame_data({
      id: this.frameId,
      selectedThreadKey: threadKey,
    });
  };
}

function threadKeyToIso(threadKey: string): string | null {
  if (!threadKey) return null;
  const ms = Number(threadKey);
  if (Number.isFinite(ms)) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return null;
    }
  }
  return typeof threadKey === "string" ? threadKey : null;
}

// We strip out any cased version of the string @chatgpt and also all mentions.
function stripMentions(value: string): string {
  for (const name of ["@chatgpt4", "@chatgpt"]) {
    while (true) {
      const i = value.toLowerCase().indexOf(name);
      if (i == -1) break;
      value = value.slice(0, i) + value.slice(i + name.length);
    }
  }
  // The mentions looks like this: <span class="user-mention" account-id=openai-... >@ChatGPT</span> ...
  while (true) {
    const i = value.indexOf('<span class="user-mention"');
    if (i == -1) break;
    const j = value.indexOf("</span>", i);
    if (j == -1) break;
    value = value.slice(0, i) + value.slice(j + "</span>".length);
  }
  return value.trim();
}

// not necessary
// // Remove instances of <details> and </details> from value:
// function stripDetails(value: string): string {
//   return value.replace(/<details>/g, "").replace(/<\/details>/g, "");
// }

function mentionsLanguageModel(input?: string): boolean {
  const x = input?.toLowerCase() ?? "";

  // if any of these prefixes are in the input as "account-id=[prefix]", then return true
  const sys = LANGUAGE_MODEL_PREFIXES.some((prefix) =>
    x.includes(`account-id=${prefix}`),
  );
  if (sys || x.includes(`account-id=${USER_LLM_PREFIX}`)) return true;
  if (x.includes("openai-codex-agent") || x.includes("@codex")) return true;
  return false;
}

/**
 * For the given content of a message, this tries to extract a mentioned language model.
 */
function getLanguageModel(input?: string): false | LanguageModel {
  if (!input) return false;
  const x = input.toLowerCase();
  if (x.includes("openai-codex-agent") || x.includes("@codex")) {
    return "codex-agent";
  }
  if (x.includes("account-id=chatgpt4")) {
    return "gpt-4";
  }
  if (x.includes("account-id=chatgpt")) {
    return "gpt-3.5-turbo";
  }
  // these prefixes should come from util/db-schema/openai::model2service
  for (const vendorPrefix of LANGUAGE_MODEL_PREFIXES) {
    const prefix = `account-id=${vendorPrefix}`;
    const i = x.indexOf(prefix);
    if (i != -1) {
      const j = x.indexOf(">", i);
      const model = x.slice(i + prefix.length, j).trim() as LanguageModel;
      // for now, ollama must be prefixed – in the future, all model names should have a vendor prefix!
      if (vendorPrefix === OLLAMA_PREFIX) {
        return toOllamaModel(model);
      }
      if (vendorPrefix === CUSTOM_OPENAI_PREFIX) {
        return toCustomOpenAIModel(model);
      }
      if (vendorPrefix === USER_LLM_PREFIX) {
        return `${USER_LLM_PREFIX}${model}`;
      }
      return model;
    }
  }
  return false;
}

function toISOString(date?: Date | string): string | undefined {
  if (typeof date == "string") {
    return date;
  }
  try {
    return date?.toISOString();
  } catch {
    //console.warn("invalid date", date);
    //return;
  }
}
