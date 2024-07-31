/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { List, Map, Seq, fromJS, Map as immutableMap } from "immutable";
import { debounce } from "lodash";
import { Optional } from "utility-types";

import { setDefaultLLM } from "@cocalc/frontend/account/useLanguageModelSetting";
import { Actions, redux } from "@cocalc/frontend/app-framework";
import { History as LanguageModelHistory } from "@cocalc/frontend/client/types";
import type {
  HashtagState,
  SelectedHashtags,
} from "@cocalc/frontend/editors/task-editor/types";
import {
  modelToMention,
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { open_new_tab } from "@cocalc/frontend/misc";
import { calcMinMaxEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import enableSearchEmbeddings from "@cocalc/frontend/search/embeddings";
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
import { cmp, isValidUUID, parse_hashtags, uuid } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { getSortedDates, getUserName } from "./chat-log";
import { message_to_markdown } from "./message";
import { ChatState, ChatStore } from "./store";
import {
  ChatMessage,
  ChatMessageTyped,
  ChatMessages,
  Feedback,
  MessageHistory,
} from "./types";
import { getSelectedHashtagsSearch } from "./utils";

const MAX_CHATSTREAM = 10;

export class ChatActions extends Actions<ChatState> {
  public syncdb?: SyncDB;
  private store?: ChatStore;
  // We use this to ensure at most once chatgpt output is streaming
  // at a time in a given chatroom.  I saw a bug where hundreds started
  // at once and it really did send them all to openai at once, and
  // this prevents that at least.
  private chatStreams: Set<string> = new Set([]);

  public set_syncdb(syncdb: SyncDB, store: ChatStore): void {
    this.syncdb = syncdb;
    this.store = store;

    enableSearchEmbeddings({
      project_id: store.get("project_id")!,
      path: store.get("path")!,
      syncdb,
      transform: (elt) => {
        if (elt["event"] != "chat") return;
        return {
          date: elt["date"],
          content: elt["history"]?.[0]?.content,
          sender_id: elt["sender_id"],
        };
      },
      primaryKey: "date",
      textColumn: "content",
      metaColumns: ["sender_id"],
    });
  }

  public close(): void {
    this.syncdb?.close();
    delete this.syncdb;
  }

  // NOTE: x must be already a plain JS object (.toJS())
  private process_syncdb_obj(x): ChatMessage | undefined {
    if (x.event !== "chat") {
      // Event used to be used for video chat, etc...; but we have a better approach now, so
      // all events we care about are chat.
      return;
    }
    if (x.video_chat != null ? x.video_chat.is_video_chat : undefined) {
      // discard/ignore anything else related to the old old video chat approach
      return;
    }
    x.date = new Date(x.date);
    if ((x.history != null ? x.history.length : undefined) > 0) {
      // nontrivial history -- nothing to do
    } else if (x.payload != null) {
      // for old chats with payload: content (2014-2016)... plus the script @hsy wrote in the work project ;-(
      x.history = [];
      x.history.push({
        content: x.payload.content,
        author_id: x.sender_id,
        date: new Date(x.date),
      });
      delete x.payload;
    } else if (x.mesg != null) {
      // for old chats with mesg: content (up to 2014)
      x.history = [];
      x.history.push({
        content: x.mesg.content,
        author_id: x.sender_id,
        date: new Date(x.date),
      });
      delete x.mesg;
    }
    if (x.history == null) {
      x.history = [];
    }
    if (!x.editing) {
      x.editing = {};
    }
    x.folding ??= [];
    x.feedback ??= {};
    return x;
  }

  // Initialize the state of the store from the contents of the syncdb.
  public init_from_syncdb(): void {
    if (this.syncdb == null) return;
    const v = {};
    for (let x of this.syncdb.get().toJS()) {
      x = this.process_syncdb_obj(x);
      if (x != null) {
        v[x.date.valueOf()] = x;
      }
    }

    this.setState({
      messages: fromJS(v) as any,
    });
  }

  public syncdb_change(changes): void {
    changes.map((obj) => {
      if (this.syncdb == null) return;
      obj = obj.toJS();
      if (obj.event === "draft") {
        let drafts = this.store?.get("drafts") ?? (fromJS({}) as any);
        // used to show that another user is editing a message.
        const record = this.syncdb.get_one(obj);
        if (record == null) {
          drafts = drafts.delete(obj.sender_id);
        } else {
          const sender_id = record.get("sender_id");
          drafts = drafts.set(sender_id, record);
        }
        this.setState({ drafts });
        return;
      }
      if (obj.event === "chat") {
        let changed: boolean = false;
        let messages = this.store?.get("messages") ?? (fromJS({}) as any);
        obj.date = new Date(obj.date);
        const record = this.syncdb.get_one(obj);
        let x: any = record?.toJS();
        if (x == null) {
          // delete
          messages = messages.delete(`${obj.date.valueOf()}`);
          changed = true;
        } else {
          x = this.process_syncdb_obj(x);
          if (x != null) {
            messages = messages.set(`${x.date.valueOf()}`, fromJS(x));
            changed = true;
          }
        }
        if (changed) {
          this.setState({ messages });
        }
      }
    });
  }

  public foldThread(reply_to: Date, msgIndex: number) {
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

    if (folded && msgIndex != null) {
      this.scrollToBottom(msgIndex);
    }
  }

  public feedback(message: ChatMessageTyped, feedback: Feedback | null) {
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
  }

  // The second parameter is used for sending a message by
  // chatgpt, which is currently managed by the frontend
  // (not the project).  Also the async doesn't finish until
  // chatgpt is totally done.
  send_chat({
    input,
    sender_id = this.redux.getStore("account").get_account_id(),
    reply_to,
    tag,
    noNotification,
  }: {
    input?: string;
    sender_id?: string;
    reply_to?: Date;
    tag?: string;
    noNotification?: boolean;
  }): string {
    if (this.syncdb == null || this.store == null) {
      console.warn("attempt to send_chat before chat actions initialized");
      // WARNING: give an error or try again later?
      return "";
    }
    if (input == null) {
      input = this.store.get("input");
    }
    input = input.trim();
    if (input.length == 0 || this.store.get("is_uploading")) {
      // do not send while uploading or there is nothing to send.
      return "";
    }
    const time_stamp: Date = webapp_client.server_time();
    const time_stamp_str = time_stamp.toISOString();
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
    this.syncdb.set(message);
    if (!reply_to) {
      this.delete_draft(0);
    }
    // NOTE: we also clear search, since it's confusing to send a message and not
    // even see it (if it doesn't match search).  We do NOT clear the hashtags though,
    // since by default the message you are sending has those tags.
    this.setState({
      input: "",
      search: "",
    });
    this.ensureDraftStartsWithHashtags(false);

    if (this.store) {
      const project_id = this.store.get("project_id");
      const path = this.store.get("path");
      // set notification saying that we sent an actual chat
      let action;
      if (
        noNotification ||
        mentionsLanguageModel(input) ||
        this.isLanguageModelThread(reply_to)
      ) {
        // Note: don't mark it is a chat if it is with chatgpt,
        // since no point in notifying all collabs of this.
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
    }
    this.save_to_disk();
    (async () => {
      await this.processLLM({
        message,
        reply_to: reply_to ?? time_stamp,
        tag,
      });
    })();
    return time_stamp_str;
  }

  public set_editing(message: ChatMessageTyped, is_editing: boolean) {
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
  }

  // Used to edit sent messages.
  // NOTE: this is inefficient; it assumes
  //       the number of edits is small, which is reasonable -- nobody makes hundreds of distinct
  //       edits of a single message.
  public send_edit(message: ChatMessageTyped, content: string): void {
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
    this.delete_draft(message.get("date")?.valueOf());
    this.save_to_disk();
  }

  save_history(
    message: ChatMessage,
    content: string,
    author_id: string,
    generating: boolean = false,
  ): {
    date: string;
    prevHistory: MessageHistory[];
  } {
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
  }

  send_reply({
    message,
    reply,
    from,
    noNotification,
    reply_to,
  }: {
    message: ChatMessage;
    reply: string;
    from?: string;
    noNotification?: boolean;
    reply_to?: Date;
  }): string {
    // the reply_to field of the message is *always* the root.
    // the order of the replies is by timestamp.  This is meant
    // to make sure chat is just 1 layer deep, rather than a
    // full tree structure, which is powerful but too confusing.
    reply_to ??= getReplyToRoot(
      message,
      this.store?.get("messages") ?? (fromJS({}) as ChatMessages),
    );
    const time = reply_to?.valueOf() ?? 0;
    const time_stamp_str = this.send_chat({
      input: reply,
      sender_id: from ?? this.redux.getStore("account").get_account_id(),
      reply_to,
      noNotification,
    });
    this.delete_draft(-time);
    // it's conceivable that for some clients they recreate the draft
    // message right as the editor for that message is being removed.
    // Thus we do an extra delete a moment after send (after successfully
    // sending the message) to be sure the draft is really gone.
    // See https://github.com/sagemathinc/cocalc/issues/7662
    // and note that I'm not able to reproduce this, so it might not
    // be the right solution.
    setTimeout(() => {
      this.delete_draft(-time);
    }, 500);
    return time_stamp_str;
  }

  // negative date is used for replies.
  public delete_draft(
    date: number,
    commit: boolean = true,
    sender_id: string | undefined = undefined,
  ) {
    if (!this.syncdb) return;
    sender_id = sender_id ?? this.redux.getStore("account").get_account_id();
    // date should always be negative for drafts (stupid, but that's the code),
    // so I'm just deleting both for now.
    if (date) {
      this.syncdb.delete({
        event: "draft",
        sender_id,
        date,
      });
    }
    this.syncdb.delete({
      event: "draft",
      sender_id,
      date: -date,
    });
    if (commit) {
      this.syncdb.commit();
    }
  }

  // Make sure everything saved to DISK.
  public async save_to_disk(): Promise<void> {
    if (this.syncdb == null) return;
    try {
      this.setState({ is_saving: true });
      await this.syncdb.save_to_disk();
    } finally {
      this.setState({ is_saving: false });
    }
  }

  public set_input(input: string): void {
    this.setState({ input });
  }

  public llm_estimate_cost: typeof this._llm_estimate_cost = debounce(
    reuseInFlight(this._llm_estimate_cost).bind(this),
    1000,
    { leading: true, trailing: true },
  );

  private async _llm_estimate_cost(
    input: string,
    type: "room" | "reply",
    message?: ChatMessage,
  ): Promise<void> {
    if (!this.store) return;

    const is_cocalc_com = this.redux.getStore("customize").get("is_cocalc_com");
    if (!is_cocalc_com) return;

    // this is either a new message or in a reply, but mentions an LLM
    let model: LanguageModel | null | false = getLanguageModel(input);
    const key: keyof ChatState =
      type === "room" ? "llm_cost_room" : "llm_cost_reply";

    input = stripMentions(input);
    let history: string[] = [];
    const messages = this.store.get("messages");
    // message != null means this is a reply and we have to get the whole chat thread
    if (!model && message != null && messages != null) {
      const root = getReplyToRoot(message, messages);
      model = this.isLanguageModelThread(root);
      if (!isFreeModel(model, is_cocalc_com) && root != null) {
        for (const msg of this.getLLMHistory(root)) {
          history.push(msg.content);
        }
      }
    }

    if (model) {
      if (isFreeModel(model, is_cocalc_com)) {
        this.setState({ [key]: [0, 0] });
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
        this.setState({ [key]: [min, max] });
      }
    } else {
      this.setState({ [key]: null });
    }
  }

  public set_is_preview(is_preview): void {
    this.setState({ is_preview });
  }

  public set_use_saved_position(use_saved_position): void {
    this.setState({ use_saved_position });
  }

  public save_scroll_state(position, height, offset): void {
    if (height == 0) {
      // height == 0 means chat room is not rendered
      return;
    }
    this.setState({ saved_position: position, height, offset });
  }

  // scroll to the bottom of the chat log
  // if date is given, scrolls to the bottom of the chat *thread*
  // that starts with that date.
  // safe to call after closing actions.
  public scrollToBottom(index: number = -1) {
    if (this.syncdb == null) return;
    // this triggers scroll behavior in the chat-log component.
    this.setState({ scrollToBottom: null }); // noop, but necessary to trigger a change
    this.setState({ scrollToBottom: index });
  }

  public set_uploading(is_uploading: boolean): void {
    this.setState({ is_uploading });
  }

  public change_font_size(delta: number): void {
    if (!this.store) return;
    const font_size = this.store.get("font_size") + delta;
    this.setState({ font_size });
  }

  // Scan through all messages and figure out what hashtags are used.
  // Of course, at some point we should try to use efficient algorithms
  // to make this faster incrementally.
  public update_hashtags(): void {}

  // Exports the currently visible chats to a markdown file and opens it.
  public async export_to_markdown(): Promise<void> {
    if (!this.store) return;
    const messages = this.store.get("messages");
    if (messages == null) return;
    const path = this.store.get("path") + ".md";
    const project_id = this.store.get("project_id");
    if (project_id == null) return;
    const { dates } = getSortedDates(messages, this.store.get("search"));
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
  }

  setHashtagState(tag: string, state?: HashtagState): void {
    if (!this.store) return;
    // similar code in task list.
    let selectedHashtags: SelectedHashtags =
      this.store.get("selectedHashtags") ??
      immutableMap<string, HashtagState>();
    selectedHashtags =
      state == null
        ? selectedHashtags.delete(tag)
        : selectedHashtags.set(tag, state);
    this.setState({ selectedHashtags });
    this.ensureDraftStartsWithHashtags(true);
  }

  private ensureDraftStartsWithHashtags(commit: boolean = false): void {
    if (this.syncdb == null || this.store == null) return;
    // set draft input to match selected hashtags, if any.
    const hashtags = this.store.get("selectedHashtags");
    if (hashtags == null) return;
    const { selectedHashtagsSearch } = getSelectedHashtagsSearch(hashtags);
    let input = this.store.get("input");
    const prefix = selectedHashtagsSearch.trim() + " ";
    if (input.startsWith(prefix)) {
      return;
    }
    const v = parse_hashtags(input);
    if (v.length > 0) {
      input = input.slice(v[v.length - 1][1]);
    }

    input = prefix + input;
    this.setState({ input });
    const sender_id = this.redux.getStore("account").get_account_id();
    this.syncdb.set({
      event: "draft",
      active: Date.now(),
      sender_id,
      input,
      date: 0,
    });
    if (commit) {
      this.syncdb.commit();
    }
  }

  public help() {
    open_new_tab("https://doc.cocalc.com/chat.html");
  }

  public undo() {
    this.syncdb?.undo();
  }

  public redo() {
    this.syncdb?.redo();
  }

  /**
   * This checks a thread of messages to see if it is a language model thread and if so, returns it.
   */
  public isLanguageModelThread(date?: Date): false | LanguageModel {
    if (date == null) {
      return false;
    }
    const messages = this.getMessagesInThread(date.toISOString());
    if (messages == null) {
      return false;
    }

    // We deliberately start at the last most recent message.
    // Why? If we use the LLM regenerate dropdown button to change the LLM, we want to keep it.
    for (const message of messages.reverse()) {
      const lastHistory = message.get("history")?.first();
      // this must be an invalid message, because there is no history
      if (lastHistory == null) continue;
      const sender_id = lastHistory.get("author_id");
      if (isLanguageModelService(sender_id)) {
        return service2model(sender_id);
      }
      const input = lastHistory.get("content")?.toLowerCase();
      if (mentionsLanguageModel(input)) {
        return getLanguageModel(input);
      }
    }

    return false;
  }

  private async processLLM({
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
  }) {
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
    // if an llm is explicitly set, we only allow that for regenerate and we also check if it is enabled and selecable by the user
    if (typeof llm === "string") {
      if (tag !== "regenerate") {
        console.warn(`chat/llm: llm=${llm} is only allowed for tag=regenerate`);
        return;
      }
    }
    if (tag !== "regenerate" && !isValidUUID(message.history?.[0]?.author_id)) {
      // do NOT respond to a message that an LLM is sending,
      // because that would result in an infinite recursion.
      // Note: LLMs do not use avalid UUID, but a special string.
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
      // This is a request to regerenate the last message with a specific model.
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
        ? this.save_history(message, thinking, sender_id, true)
        : {
            date: this.send_reply({
              message,
              reply: thinking,
              from: sender_id,
              noNotification: true,
              reply_to,
            }),
          };

    if (this.chatStreams.size > MAX_CHATSTREAM) {
      console.trace(
        `processLanguageModel called when ${MAX_CHATSTREAM} streams active`,
      );
      if (this.syncdb != null) {
        // This should never happen in normal use, but could prevent an expensive blowup due to a bug.
        this.syncdb.set({
          date,
          history: [
            {
              author_id: sender_id,
              content: `\n\n<span style='color:#b71c1c'>There are already ${MAX_CHATSTREAM} language model responses being written. Please try again once one finishes.</span>\n\n`,
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
        const reply_to = getReplyToRoot(
          cur.toJS() as any as ChatMessage,
          messages,
        );
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

    // FIXME: these scrollToBottoms are a good idea, but they need an index number – not the date/timestamp
    // this.scrollToBottom(reply_to?.valueOf());
    let content: string = "";
    let halted = false;

    chatStream.on("token", (token) => {
      if (halted || this.syncdb == null) return;

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
        // this.scrollToBottom(reply_to?.valueOf());
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
      // this.scrollToBottom(reply_to?.valueOf());
    });
  }

  /**
   * @param dateStr - the ISO date of the message to get the thread for
   * @returns  - the messages in the thread, sorted by date
   */
  private getMessagesInThread(
    dateStr: string,
  ): Seq.Indexed<ChatMessageTyped> | undefined {
    const messages = this.store?.get("messages");
    if (messages == null) return;
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
  }

  // the input and output for the thread ending in the
  // given message, formatted for querying a langauge model, and heuristically
  // truncated to not exceed a limit in size.
  private getLLMHistory(reply_to: Date): LanguageModelHistory {
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
  }

  public languageModelStopGenerating(date: Date) {
    if (this.syncdb == null) return;
    this.syncdb.set({
      event: "chat",
      date: date.toISOString(),
      generating: false,
    });
    this.syncdb.commit();
  }

  public async summarizeThread({
    model,
    reply_to,
    returnInfo,
    short,
  }: {
    model: LanguageModel;
    reply_to?: string;
    returnInfo?: boolean; // do not send, but return prompt + info}
    short: boolean;
  }) {
    if (!reply_to) return;
    const user_map = redux.getStore("users").get("user_map");
    if (!user_map) return;
    const threadMessages = this.getMessagesInThread(reply_to);
    if (!threadMessages) return;

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
      this.send_chat({
        input: prompt,
        tag: `chat:summarize`,
        noNotification: true,
      });
      this.scrollToBottom();
    }
  }

  public async regenerateLLMResponse(date0: Date, llm?: LanguageModel) {
    if (this.syncdb == null) return;
    const date = date0.toISOString();
    const obj = this.syncdb.get_one({ event: "chat", date });
    const message = this.process_syncdb_obj(obj?.toJS());
    if (message == null) return;
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
  }
}

export function getRootMessage(
  message: ChatMessage,
  messages: ChatMessages,
): ChatMessageTyped | undefined {
  const { reply_to, date } = message;
  // we can't find the original message, if there is no reply_to
  if (!reply_to) {
    // the msssage itself is the root
    return messages.get(`${new Date(date).valueOf()}`);
  } else {
    // All messages in a thread have the same reply_to, which points to the root.
    return messages.get(`${new Date(reply_to).valueOf()}`);
  }
}

function getReplyToRoot(
  message: ChatMessage,
  messages: ChatMessages,
): Date | undefined {
  const root = getRootMessage(message, messages);
  const date = root?.get("date");
  // date is a "Date" object, but we're just double checking it is not a string by accident
  return date ? new Date(date) : undefined;
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
  // these prefexes should come from util/db-schema/openai::model2service
  for (const vendorprefix of LANGUAGE_MODEL_PREFIXES) {
    const prefix = `account-id=${vendorprefix}`;
    const i = x.indexOf(prefix);
    if (i != -1) {
      const j = x.indexOf(">", i);
      const model = x.slice(i + prefix.length, j).trim() as LanguageModel;
      // for now, ollama must be prefixed – in the future, all model names should have a vendor prefix!
      if (vendorprefix === OLLAMA_PREFIX) {
        return toOllamaModel(model);
      }
      if (vendorprefix === CUSTOM_OPENAI_PREFIX) {
        return toCustomOpenAIModel(model);
      }
      if (vendorprefix === USER_LLM_PREFIX) {
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
