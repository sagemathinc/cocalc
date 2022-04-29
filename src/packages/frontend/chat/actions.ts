/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { fromJS } from "immutable";

import { SyncDB } from "@cocalc/sync/editor/db";
import { user_tracking } from "../user-tracking";

import { Actions } from "../app-framework";
import { webapp_client } from "../webapp-client";
import { ChatState, ChatStore } from "./store";
import { get_sorted_dates } from "./chat-log";
import { message_to_markdown } from "./message";

export class ChatActions extends Actions<ChatState> {
  public syncdb?: SyncDB;
  private store?: ChatStore;

  public set_syncdb(syncdb: SyncDB): void {
    this.syncdb = syncdb;
  }

  public close(): void {
    this.syncdb?.close();
    delete this.syncdb;
  }

  private process_syncdb_obj(x) {
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
      messages: fromJS(v),
    });
  }

  public syncdb_change(changes): void {
    changes.map((obj) => {
      if (this.syncdb == null) return;
      obj = obj.toJS();
      if (obj.event == "draft") {
        let drafts = this.store?.get("drafts") ?? fromJS({});
        // used to show that another user is editing a message.
        const record = this.syncdb.get_one(obj);
        if (record == null) return;
        const sender_id = record.get("sender_id");
        drafts = drafts.set(sender_id, record);
        this.setState({ drafts });
        return;
      }
      if (obj.event == "chat") {
        let changed: boolean = false;
        let messages = this.store?.get("messages") ?? fromJS({});
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

  public send_chat(input?: string): void {
    if (this.syncdb == null || this.store == null) {
      // WARNING: give an error or try again later?
      return;
    }
    if (input == null) {
      input = this.store.get("input");
    }
    input = input.trim();
    if (input.length == 0 || this.store.get("is_uploading")) {
      // do not send while uploading or there is nothing to send.
      return;
    }
    const sender_id = this.redux.getStore("account").get_account_id();
    const time_stamp = webapp_client.server_time().toISOString();
    this.syncdb.set({
      event: "draft",
      sender_id,
      input,
      date: 0,
    });
    this.syncdb.commit();
    this.syncdb.set({
      sender_id,
      event: "chat",
      history: [{ author_id: sender_id, content: input, date: time_stamp }],
      date: time_stamp,
    });
    this.syncdb.set({
      event: "draft",
      sender_id,
      input: "",
      date: 0,
    });
    // NOTE: we clear search, since it's very confusing to send a message and not
    // even see it (if it doesn't match search).
    this.setState({ search: "", input: "" });
    // NOTE: further that annoyingly the search box isn't controlled so the input
    // isn't cleared, which is also confusing. todo -- fix.
    user_tracking("send_chat", {
      project_id: this.store?.get("project_id"),
      path: this.store?.get("path"),
    });
    this.save_to_disk();
  }

  public set_editing(message, is_editing) {
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
  // TODO: this is **Extremely** shockingly inefficient; it assumes
  //       the number of edits is small.
  public send_edit(message, content) {
    if (this.syncdb == null) {
      // WARNING: give an error or try again later?
      return;
    }
    const author_id = this.redux.getStore("account").get_account_id();
    // OPTIMIZATION: send less data over the network?
    const date = webapp_client.server_time().toISOString();

    this.syncdb.set({
      history: [{ author_id, content, date }].concat(
        message.get("history").toJS()
      ),
      editing: message.get("editing").set(author_id, null).toJS(),
      date: message.get("date").toISOString(),
    });
    this.save_to_disk();
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
    const sorted_dates = get_sorted_dates(messages, this.store.get("search"));
    const v: string[] = [];
    for (const date of sorted_dates) {
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
}
