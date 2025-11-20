/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { List, Map, Seq, Map as immutableMap } from "immutable";
import { debounce } from "lodash";
import { Optional } from "utility-types";
import { setDefaultLLM } from "@cocalc/frontend/account/useLanguageModelSetting";
import { Actions, redux } from "@cocalc/frontend/app-framework";
import { History as LanguageModelHistory } from "@cocalc/frontend/client/types";
import type {
  HashtagState,
  SelectedHashtags,
} from "@cocalc/frontend/editors/task-editor/types";
import type { Actions as CodeEditorActions } from "@cocalc/frontend/frame-editors/code-editor/actions";
import {
  modelToMention,
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { open_new_tab } from "@cocalc/frontend/misc";
import Fragment from "@cocalc/frontend/misc/fragment-id";
import { calcMinMaxEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { SyncDB } from "@cocalc/sync/editor/db";
import {
  CUSTOM_OPENAI_PREFIX,
  LANGUAGE_MODEL_PREFIXES,
  OLLAMA_PREFIX,
  USER_LLM_PREFIX,
  getLLMServiceStatusCheckMD,
  isFreeModel,
  isLanguageModel,
  isLanguageModelService,
  model2service,
  model2vendor,
  service2model,
  toCustomOpenAIModel,
  toOllamaModel,
  type LanguageModel,
} from "@cocalc/util/db-schema/llm-utils";
import { cmp, history_path, isValidUUID, uuid } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { getSortedDates, getUserName } from "./chat-log";
import { message_to_markdown } from "./message";
import { ChatState, ChatStore } from "./store";
import { processCodexLLM } from "./codex-api";
import { handleSyncDBChange, initFromSyncDB, processSyncDBObj } from "./sync";
import type {
  ChatMessage,
  ChatMessageTyped,
  Feedback,
  MessageHistory,
} from "./types";
import { getReplyToRoot, getThreadRootDate, toMsString } from "./utils";

const MAX_CHAT_STREAM = 10;

export class ChatActions extends Actions<ChatState> {
  public syncdb?: SyncDB;
  public store?: ChatStore;
  // We use this to ensure at most once chatgpt output is streaming
  // at a time in a given chatroom.  I saw a bug where hundreds started
  // at once and it really did send them all to openai at once, and
  // this prevents that at least.
  private chatStreams: Set<string> = new Set([]);
  public frameId: string = "";
  // this might not be set e.g., for deprecated side chat on sagews:
  public frameTreeActions?: CodeEditorActions;

  set_syncdb = (syncdb: SyncDB, store: ChatStore): void => {
    this.syncdb = syncdb;
    this.store = store;
  };

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
    const folding = cur?.get("folding") ?? List([]);
    const folded = folding.includes(account_id);
    const next = folded
      ? folding.filter((x) => x !== account_id)
      : folding.push(account_id);

    this.syncdb.set({
      folding: next,
      date: typeof reply_to === "string" ? reply_to : reply_to.toISOString(),
    });

    this.syncdb.commit();

    if (folded && messageIndex != null) {
      this.scrollToIndex(messageIndex);
    }
  };

  foldAllThreads = (onlyLLM = true) => {
    if (this.syncdb == null || this.store == null) return;
    const messages = this.store.get("messages");
    if (messages == null) return;
    const account_id = this.redux.getStore("account").get_account_id();
    for (const [_timestamp, message] of messages) {
      // ignore replies
      if (message.get("reply_to") != null) continue;
      const date = message.get("date");
      if (!(date instanceof Date)) continue;
      const isLLMThread = this.isLanguageModelThread(date) !== false;
      if (onlyLLM && !isLLMThread) continue;
      const folding = message?.get("folding") ?? List([]);
      const folded = folding.includes(account_id);
      if (!folded) {
        this.syncdb.set({
          folding: folding.push(account_id),
          date,
        });
      }
    }
  };

  feedback = (message: ChatMessageTyped, feedback: Feedback | null) => {
    if (this.syncdb == null) return;
    const date = message.get("date");
    if (!(date instanceof Date)) return;
    const account_id = this.redux.getStore("account").get_account_id();
    const cur = this.syncdb.get_one({ event: "chat", date });
    const feedbacks = cur?.get("feedback") ?? Map({});
    const next = feedbacks.set(account_id, feedback);
    this.syncdb.set({ feedback: next, date: date.toISOString() });
    this.syncdb.commit();
    const model = this.isLanguageModelThread(date);
    if (isLanguageModel(model)) {
      track("llm_feedback", {
        project_id: this.store?.get("project_id"),
        path: this.store?.get("path"),
        msg_date: date.toISOString(),
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
    const message: ChatMessage = {
      sender_id,
      event: "chat",
      history: [
        {
          author_id: sender_id,
          content: input,
          date: time_stamp_str,
        },
      ],
      date: time_stamp_str,
      reply_to: reply_to?.toISOString(),
      editing: {},
    };
    if (trimmedName && !reply_to) {
      (message as any).name = trimmedName;
    }
    this.syncdb.set(message);
    const messagesState = this.store.get("messages");
    let selectedThreadKey: string;
    if (!reply_to) {
      this.deleteDraft(0);
      // NOTE: we also clear search, since it's confusing to send a message and not
      // even see it (if it doesn't match search).  We do NOT clear the hashtags though,
      // since by default the message you are sending has those tags.
      // Also, only do this clearing when not replying.
      // For replies search find full threads not individual messages.
      this.clearAllFilters();
      selectedThreadKey = `${time_stamp.valueOf()}`;
    } else {
      // when replying we make sure that the thread is expanded, since otherwise
      // our reply won't be visible
      if (
        messagesState
          ?.getIn([`${reply_to.valueOf()}`, "folding"])
          ?.includes(sender_id)
      ) {
        this.toggleFoldThread(reply_to);
      }
      const root =
        getThreadRootDate({
          date: reply_to.valueOf(),
          messages: messagesState,
        }) ?? reply_to.valueOf();
      selectedThreadKey = `${root}`;
    }
    if (selectedThreadKey != "0") {
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

    this.save_to_disk();
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

    // "FUTURE" = save edit changes
    const editing = message
      .get("editing")
      .set(author_id, is_editing ? "FUTURE" : null);

    // console.log("Currently Editing:", editing.toJS())
    this.syncdb.set({
      history: message.get("history").toJS(),
      editing: editing.toJS(),
      date: message.get("date").toISOString(),
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

    this.syncdb.set({
      history: addToHistory(
        message.get("history").toJS() as unknown as MessageHistory[],
        {
          author_id,
          content,
          date,
        },
      ),
      editing: message.get("editing").set(author_id, null).toJS(),
      date: message.get("date").toISOString(),
    });
    this.deleteDraft(message.get("date")?.valueOf());
    this.save_to_disk();
  };

  saveHistory = (
    message: ChatMessage,
    content: string,
    author_id: string,
    generating: boolean = false,
  ): {
    date: string;
    prevHistory: MessageHistory[];
  } => {
    const date: string =
      typeof message.date === "string"
        ? message.date
        : message.date?.toISOString();
    if (this.syncdb == null) {
      return { date, prevHistory: [] };
    }
    const prevHistory: MessageHistory[] = message.history ?? [];
    this.syncdb.set({
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
    message: ChatMessage;
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
            messages: store.get("messages"),
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

  // Make sure everything saved to DISK.
  save_to_disk = async (): Promise<void> => {
    this.syncdb?.save_to_disk();
  };

  private _llmEstimateCost = async ({
    input,
    date,
    message,
  }: {
    input: string;
    // date is as in chat/input.tsx -- so 0 for main input and -ms for reply
    date: number;
    // in case of reply/edit, so we can get the entire thread
    message?: ChatMessage;
  }): Promise<void> => {
    if (!this.store) {
      return;
    }

    const is_cocalc_com = this.redux.getStore("customize").get("is_cocalc_com");
    if (!is_cocalc_com) {
      return;
    }
    // this is either a new message or in a reply, but mentions an LLM
    let model: LanguageModel | null | false = getLanguageModel(input);
    input = stripMentions(input);
    let history: string[] = [];
    const messages = this.store.get("messages");
    // message != null means this is a reply or edit and we have to get the whole chat thread
    if (!model && message != null && messages != null) {
      const root = getReplyToRoot({ message, messages });
      model = this.isLanguageModelThread(root);
      if (!isFreeModel(model, is_cocalc_com) && root != null) {
        for (const msg of this.getLLMHistory(root)) {
          history.push(msg.content);
        }
      }
    }
    if (model) {
      if (isFreeModel(model, is_cocalc_com)) {
        this.setCostEstimate({ date, min: 0, max: 0 });
      } else {
        const llm_markup = this.redux.getStore("customize").get("llm_markup");
        // do not import until needed -- it is HUGE!
        const { truncateMessage, getMaxTokens, numTokensUpperBound } =
          await import("@cocalc/frontend/misc/llm");
        const maxTokens = getMaxTokens(model);
        const tokens = numTokensUpperBound(
          truncateMessage([input, ...history].join("\n"), maxTokens),
          maxTokens,
        );
        const { min, max } = calcMinMaxEstimation(tokens, model, llm_markup);
        this.setCostEstimate({ date, min, max });
      }
    } else {
      this.setCostEstimate();
    }
  };

  llmEstimateCost: typeof this._llmEstimateCost = debounce(
    reuseInFlight(this._llmEstimateCost),
    1000,
    { leading: true, trailing: true },
  );

  private setCostEstimate = (
    costEstimate: {
      date: number;
      min: number;
      max: number;
    } | null = null,
  ) => {
    this.frameTreeActions?.set_frame_data({
      id: this.frameId,
      costEstimate,
    });
  };

  // returns number of deleted messages
  // threadKey = iso timestamp root of thread.
  deleteThread = (threadKey: string): number => {
    if (this.syncdb == null || this.store == null) {
      return 0;
    }
    const messages = this.store.get("messages");
    if (messages == null) {
      return 0;
    }
    const rootTarget = parseInt(`${threadKey}`);
    if (!isFinite(rootTarget)) {
      return 0;
    }
    let deleted = 0;
    for (const [_, message] of messages) {
      if (message == null) continue;
      const dateField = message.get("date");
      let dateValue: number | undefined;
      let dateIso: string | undefined;
      if (dateField instanceof Date) {
        dateValue = dateField.valueOf();
        dateIso = dateField.toISOString();
      } else if (typeof dateField === "number") {
        dateValue = dateField;
        dateIso = new Date(dateField).toISOString();
      } else if (typeof dateField === "string") {
        const t = Date.parse(dateField);
        dateValue = isNaN(t) ? undefined : t;
        dateIso = dateField;
      }
      if (dateValue == null || dateIso == null) {
        continue;
      }
      const rootDate =
        getThreadRootDate({ date: dateValue, messages }) || dateValue;
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
    this.syncdb.set(entry.doc);
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
    this.syncdb.set(entry.doc);
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
    this.syncdb.set(entry.doc);
    if (commit) {
      this.syncdb.commit();
    }
    return true;
  };

  private getThreadRootDoc = (
    threadKey: string,
  ): { doc: any; message: ChatMessageTyped } | null => {
    if (this.store == null) {
      return null;
    }
    const messages = this.store.get("messages");
    if (messages == null) {
      return null;
    }
    const normalizedKey = toMsString(threadKey);
    const fallbackKey = `${parseInt(threadKey, 10)}`;
    const candidates = [normalizedKey, threadKey, fallbackKey];
    let message: ChatMessageTyped | undefined;
    for (const key of candidates) {
      if (!key) continue;
      message = messages.get(key);
      if (message != null) break;
    }
    if (message == null) {
      return null;
    }
    const dateField = message.get("date");
    const dateIso =
      dateField instanceof Date
        ? dateField.toISOString()
        : typeof dateField === "string"
          ? dateField
          : new Date(dateField).toISOString();
    if (!dateIso) {
      return null;
    }
    const doc = { ...message.toJS(), date: dateIso };
    return { doc, message };
  };

  save_scroll_state = (position, height, offset): void => {
    if (height == 0) {
      // height == 0 means chat room is not rendered
      return;
    }
    this.setState({ saved_position: position, height, offset });
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

  // Scan through all messages and figure out what hashtags are used.
  // Of course, at some point we should try to use efficient algorithms
  // to make this faster incrementally.
  update_hashtags = (): void => {};

  // Exports the currently visible chats to a markdown file and opens it.
  export_to_markdown = async (): Promise<void> => {
    if (!this.store) return;
    const messages = this.store.get("messages");
    if (messages == null) return;
    const path = this.store.get("path") + ".md";
    const project_id = this.store.get("project_id");
    if (project_id == null) return;
    const account_id = this.redux.getStore("account").get_account_id();
    const { dates } = getSortedDates(
      messages,
      this.store.get("search"),
      account_id,
    );
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

  setHashtagState = (tag: string, state?: HashtagState): void => {
    if (!this.store || this.frameTreeActions == null) return;
    // similar code in task list.
    let selectedHashtags: SelectedHashtags =
      this.frameTreeActions._get_frame_data(this.frameId, "selectedHashtags") ??
      immutableMap<string, HashtagState>();
    selectedHashtags =
      state == null
        ? selectedHashtags.delete(tag)
        : selectedHashtags.set(tag, state);
    this.setSelectedHashtags(selectedHashtags);
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
    const messages = this.store.get("messages");
    if (messages == null) {
      return false;
    }
    const rootMs =
      getThreadRootDate({ date: date.valueOf(), messages }) || date.valueOf();
    const entry = this.getThreadRootDoc(`${rootMs}`);
    const rootMessage = entry?.message;
    if (rootMessage == null) {
      return false;
    }

    const thread = this.getMessagesInThread(
      rootMessage.get("date")?.toISOString?.() ?? `${rootMs}`,
    );
    if (thread == null) {
      return false;
    }

    const firstMessage = thread.first();
    if (firstMessage == null) {
      return false;
    }
    const firstHistory = firstMessage.get("history")?.first();
    if (firstHistory == null) {
      return false;
    }
    const sender_id = firstHistory.get("author_id");
    if (isLanguageModelService(sender_id)) {
      return service2model(sender_id);
    }
    const input = firstHistory.get("content")?.toLowerCase();
    if (mentionsLanguageModel(input)) {
      return getLanguageModel(input);
    }
    return false;
  };

  isCodexThread = (date?: Date): boolean => {
    const model = this.isLanguageModelThread(date);
    return model ? model.includes("codex") : false;
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
    const store = this.store;
    if (this.syncdb == null || !store) {
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
      // No need to check whether a language model is enabled at all.
      // We only do this check if tag is not set, e.g., directly typing @chatgpt
      // into the input box.  If the tag is set, then the request to use
      // an LLM came from some place, e.g., the "Explain" button, so
      // we trust that.
      // We also do the check when replying.
      return;
    }
    // if an llm is explicitly set, we only allow that for regenerate and we also check if it is enabled and selectable by the user
    if (typeof llm === "string") {
      if (tag !== "regenerate") {
        console.warn(`chat/llm: llm=${llm} is only allowed for tag=regenerate`);
        return;
      }
    }
    if (tag !== "regenerate" && !isValidUUID(message.history?.[0]?.author_id)) {
      // do NOT respond to a message that an LLM is sending,
      // because that would result in an infinite recursion.
      // Note: LLMs do not use a valid UUID, but a special string.
      // For regenerate, we delete the last message, though…
      return;
    }
    let input = message.history?.[0]?.content as string | undefined;
    // if there is no input in the last message, something is really wrong
    if (input == null) return;
    // there are cases, where there is nothing in the last message – but we want to regenerate it
    if (!input && tag !== "regenerate") return;

    let model: LanguageModel | false = false;
    if (llm != null) {
      // This is a request to regenerate the last message with a specific model.
      // The message.tsx/RegenerateLLM component already checked if the LLM is enabled and selectable by the user.
      // ATTN: we trust that information!
      model = llm;
    } else if (!mentionsLanguageModel(input)) {
      // doesn't mention a language model explicitly, but might be a reply to something that does:
      if (reply_to == null) {
        return;
      }
      model = this.isLanguageModelThread(reply_to);
      if (!model) {
        // definitely not a language model chat situation
        return;
      }
    } else {
      // it mentions a language model -- which one?
      model = getLanguageModel(input);
    }

    if (model === false) {
      return;
    }

    // without any mentions, of course:
    input = stripMentions(input);
    // also important to strip details, since they tend to confuse an LLM:
    //input = stripDetails(input);

    if (typeof model === "string" && model.includes("codex")) {
      await processCodexLLM({
        message,
        reply_to,
        tag,
        model,
        input,
        dateLimit,
        context: {
          syncdb: this.syncdb,
          path: store.get("path"),
          chatStreams: this.chatStreams,
          sendReply: this.sendReply,
          saveHistory: this.saveHistory,
          getLLMHistory: this.getLLMHistory,
        },
      });
      return;
    }

    const sender_id = (function () {
      try {
        return model2service(model);
      } catch {
        return model;
      }
    })();

    const thinking = ":robot: Thinking...";
    // prevHistory: in case of regenerate, it's the history *before* we added the "Thinking..." message (which we ignore)
    const { date, prevHistory = [] } =
      tag === "regenerate"
        ? this.saveHistory(message, thinking, sender_id, true)
        : {
            date: this.sendReply({
              message,
              reply: thinking,
              from: sender_id,
              noNotification: true,
              reply_to,
            }),
          };

    if (this.chatStreams.size > MAX_CHAT_STREAM) {
      console.trace(
        `processLanguageModel called when ${MAX_CHAT_STREAM} streams active`,
      );
      if (this.syncdb != null) {
        // This should never happen in normal use, but could prevent an expensive blowup due to a bug.
        this.syncdb.set({
          date,
          history: [
            {
              author_id: sender_id,
              content: `\n\n<span style='color:#b71c1c'>There are already ${MAX_CHAT_STREAM} language model responses being written. Please try again once one finishes.</span>\n\n`,
              date,
            },
          ],
          event: "chat",
          sender_id,
        });
        this.syncdb.commit();
      }
      return;
    }

    // keep updating when the LLM is doing something:
    const project_id = store.get("project_id");
    const path = store.get("path");
    if (!tag && reply_to) {
      tag = "reply";
    }

    // record that we're about to submit message to a language model.
    track("chatgpt", {
      project_id,
      path,
      type: "chat",
      is_reply: !!reply_to,
      tag,
      model,
    });

    // submit question to the given language model
    const id = uuid();
    this.chatStreams.add(id);
    setTimeout(
      () => {
        this.chatStreams.delete(id);
      },
      3 * 60 * 1000,
    );

    // construct the LLM history for the given thread
    const history = reply_to ? this.getLLMHistory(reply_to) : undefined;

    if (tag === "regenerate") {
      if (history && history.length >= 2) {
        history.pop(); // remove the last LLM message, which is the one we're regenerating

        // if dateLimit is earlier than the last message's date, remove the last two
        while (dateLimit != null && history.length >= 2) {
          const last = history[history.length - 1];
          if (last.date != null && last.date > dateLimit) {
            history.pop();
            history.pop();
          } else {
            break;
          }
        }

        input = stripMentions(history.pop()?.content ?? ""); // the last user message is the input
      } else {
        console.warn(
          `chat/llm: regenerate called without enough history for thread starting at ${reply_to}`,
        );
        return;
      }
    }

    const chatStream = webapp_client.openai_client.queryStream({
      input,
      history,
      project_id,
      path,
      model,
      tag,
    });

    // The sender_id might change if we explicitly set the LLM model.
    if (tag === "regenerate" && llm != null) {
      if (!this.store) return;
      const messages = this.store.get("messages");
      if (!messages) return;
      if (message.sender_id !== sender_id) {
        // if that happens, create a new message with the existing history and the new sender_id
        const cur = this.syncdb.get_one({ event: "chat", date });
        if (cur == null) return;
        const reply_to = getReplyToRoot({
          message: cur.toJS() as any as ChatMessage,
          messages,
        });
        this.syncdb.delete({ event: "chat", date });
        this.syncdb.set({
          date,
          history: cur?.get("history") ?? [],
          event: "chat",
          sender_id,
          reply_to,
        });
      }
    }

    let content: string = "";
    let halted = false;

    chatStream.on("token", (token) => {
      if (halted || this.syncdb == null) {
        return;
      }

      // we check if user clicked on the "stop generating" button
      const cur = this.syncdb.get_one({ event: "chat", date });
      if (cur?.get("generating") === false) {
        halted = true;
        this.chatStreams.delete(id);
        return;
      }

      // collect more of the output
      if (token != null) {
        content += token;
      }

      const msg: ChatMessage = {
        event: "chat",
        sender_id,
        date: new Date(date),
        history: addToHistory(prevHistory, {
          author_id: sender_id,
          content,
        }),
        generating: token != null, // it's generating as token is not null
        reply_to: reply_to?.toISOString(),
      };
      this.syncdb.set(msg);

      // if it was the last output, close this
      if (token == null) {
        this.chatStreams.delete(id);
        this.syncdb.commit();
      }
    });

    chatStream.on("error", (err) => {
      this.chatStreams.delete(id);
      if (this.syncdb == null || halted) return;

      if (!model) {
        throw new Error(
          `bug: No model set, but we're in language model error handler`,
        );
      }

      const vendor = model2vendor(model);
      const statusCheck = getLLMServiceStatusCheckMD(vendor.name);
      content += `\n\n<span style='color:#b71c1c'>${err}</span>\n\n---\n\n${statusCheck}`;
      const msg: ChatMessage = {
        event: "chat",
        sender_id,
        date: new Date(date),
        history: addToHistory(prevHistory, {
          author_id: sender_id,
          content,
        }),
        generating: false,
        reply_to: reply_to?.toISOString(),
      };
      this.syncdb.set(msg);
      this.syncdb.commit();
    });
  };

  /**
   * @param dateStr - the ISO date of the message to get the thread for
   * @returns  - the messages in the thread, sorted by date
   */
  private getMessagesInThread = (
    dateStr: string,
  ): Seq.Indexed<ChatMessageTyped> | undefined => {
    const messages = this.store?.get("messages");
    if (messages == null) {
      return;
    }

    return (
      messages // @ts-ignore -- immutablejs typings are wrong (?)
        .filter(
          (message) =>
            message.get("reply_to") == dateStr ||
            message.get("date").toISOString() == dateStr,
        )
        // @ts-ignore -- immutablejs typings are wrong (?)
        .valueSeq()
        .sort((a, b) => cmp(a.get("date"), b.get("date")))
    );
  };

  // the input and output for the thread ending in the
  // given message, formatted for querying a language model, and heuristically
  // truncated to not exceed a limit in size.
  private getLLMHistory = (reply_to: Date): LanguageModelHistory => {
    const history: LanguageModelHistory = [];
    // Next get all of the messages with this reply_to or that are the root of this reply chain:
    const d = reply_to.toISOString();
    const threadMessages = this.getMessagesInThread(d);
    if (!threadMessages) return history;

    for (const message of threadMessages) {
      const mostRecent = message.get("history")?.first();
      // there must be at least one history entry, otherwise the message is broken
      if (!mostRecent) continue;
      const content = stripMentions(mostRecent.get("content"));
      // We take the message's sender ID, not the most recent version from the history
      // Why? e.g. a user could have edited an LLM message, which should still count as an LLM message
      // otherwise the forth-and-back between AI and human would be broken.
      const sender_id = message.get("sender_id");
      const role = isLanguageModelService(sender_id) ? "assistant" : "user";
      const date = message.get("date");
      history.push({ content, role, date });
    }
    return history;
  };

  languageModelStopGenerating = (date: Date) => {
    if (this.syncdb == null) return;
    this.syncdb.set({
      event: "chat",
      date: date.toISOString(),
      generating: false,
    });
    this.syncdb.commit();
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
    const threadMessages = this.getMessagesInThread(reply_to);
    if (!threadMessages) {
      return;
    }

    const history: { author: string; content: string }[] = [];
    for (const message of threadMessages) {
      const mostRecent = message.get("history")?.first();
      if (!mostRecent) continue;
      const sender_id: string | undefined = message.get("sender_id");
      const author = getUserName(user_map, sender_id);
      const content = stripMentions(mostRecent.get("content"));
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
    const date = date0.toISOString();
    const obj = this.syncdb.get_one({ event: "chat", date });
    if (obj == null) {
      return;
    }
    const message = processSyncDBObj(obj.toJS() as ChatMessage);
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
    if (this.frameTreeActions == null) {
      // crappy code just for sage worksheets -- will go away.
      return;
    }
    this.setSearch("");
    this.setFilterRecentH(0);
    this.setSelectedHashtags({});
  };

  setSearch = (search) => {
    this.frameTreeActions?.set_frame_data({ id: this.frameId, search });
  };

  setFilterRecentH = (filterRecentH) => {
    this.frameTreeActions?.set_frame_data({ id: this.frameId, filterRecentH });
  };

  setSelectedHashtags = (selectedHashtags) => {
    this.frameTreeActions?.set_frame_data({
      id: this.frameId,
      selectedHashtags,
    });
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

  setShowPreview = (showPreview) => {
    this.frameTreeActions?.set_frame_data({
      id: this.frameId,
      showPreview,
    });
  };

  setSelectedThread = (threadKey: string | null) => {
    this.frameTreeActions?.set_frame_data({
      id: this.frameId,
      selectedThreadKey: threadKey,
    });
  };
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
  return sys || x.includes(`account-id=${USER_LLM_PREFIX}`);
}

/**
 * For the given content of a message, this tries to extract a mentioned language model.
 */
function getLanguageModel(input?: string): false | LanguageModel {
  if (!input) return false;
  const x = input.toLowerCase();
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

/**
 * This uniformly defines how the history of a message is composed.
 * The newest entry is in the front of the array.
 * If the date isn't set (ISO string), we set it to the current time.
 */
function addToHistory(
  history: MessageHistory[],
  next: Optional<MessageHistory, "date">,
): MessageHistory[] {
  const {
    author_id,
    content,
    date = webapp_client.server_time().toISOString(),
  } = next;
  // inserted at the beginning of the history, without modifying the array
  return [{ author_id, content, date }, ...history];
}
