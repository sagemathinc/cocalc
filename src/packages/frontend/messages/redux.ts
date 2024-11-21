/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "@cocalc/frontend/app-framework/Table";
import { redux, Store, Actions } from "@cocalc/frontend/app-framework";
import type { iMessagesMap, iThreads } from "./types";
import { List as iList, Map as iMap } from "immutable";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export interface MessagesState {
  // map from string version of message id to immutablejs Message.
  messages?: iMessagesMap;
  threads?: iThreads;
}
export class MessagesStore extends Store<MessagesState> {}

export class MessagesActions extends Actions<MessagesState> {
  constructor(name, redux) {
    super(name, redux);
  }

  getStore = () => this.redux.getStore("messages");

  mark = async ({
    id,
    ids,
    read,
    saved,
    deleted,
    expire,
  }: {
    id?: number;
    ids?: Set<number>;
    read?: Date | null;
    saved?: boolean;
    deleted?: boolean;
    expire?: Date | null;
  }) => {
    //     console.log("mark", {
    //       id,
    //       ids,
    //       read,
    //       saved,
    //       deleted,
    //       expire,
    //     });
    const table = this.redux.getTable("messages")._table;
    if (id != null) {
      if (table.get_one(`${id}`) != null) {
        await this.redux
          .getTable("messages")
          .set({ id, read: read === null ? 0 : read, saved, deleted, expire });
      }
    }
    if (ids != null && ids.size > 0) {
      // mark them all read or saved -- have to use _table to
      // change more than one record at a time.
      for (const id of ids) {
        if (table.get_one(`${id}`) == null) {
          // not in this table, so don't mark it. E.g., trying to mark a message we sent as read/archive/deleted
          // isn't supported.
          continue;
        }
        table.set({
          id,
          read: read === null ? 0 : read,
          saved,
          deleted,
          expire: expire === null ? 0 : expire,
        });
      }
      await table.save();
    }
  };

  send = async ({
    to_id,
    to_type = "account",
    subject,
    body,
    thread_id,
  }: {
    to_id: string;
    to_type?: string;
    subject: string;
    body: string;
    thread_id?: number;
  }) => {
    await webapp_client.async_query({
      query: { messages: { subject, body, to_id, to_type, thread_id } },
    });
  };

  handleTableUpdate = (updatedMessages) => {
    const store = this.getStore();
    let messages = store.get("messages");
    if (messages == null) {
      messages = updatedMessages;
    } else {
      messages = messages.merge(updatedMessages);
    }
    const threads = getThreads(messages);
    this.setState({ messages, threads });
  };
}

export function getThreads(messages): iThreads {
  let threads: iThreads = iMap();

  const process = (message) => {
    const thread_id = message.get("thread_id");
    if (thread_id == null) {
      return;
    }
    const root = messages.get(thread_id);
    if (root == null) {
      // messages is incomplete, e.g., maybe sent aren't loaded yet.
      return;
    }
    const thread = threads.get(thread_id);
    if (thread == null) {
      threads = threads.set(thread_id, iList([root, message]));
    } else {
      threads = threads.set(thread_id, thread.push(message));
    }
  };

  messages?.map(process);
  for (const thread_id of threads.keySeq()) {
    const thread = threads.get(thread_id);
    if (thread == null) {
      throw Error("bug");
    }
    threads = threads.set(
      thread_id,
      thread.sortBy((message) => message.get("created")),
    );
  }

  return threads;
}

class MessagesTable extends Table {
  constructor(name, redux) {
    super(name, redux);
    this.query = this.query.bind(this);
    this._change = this._change.bind(this);
  }

  options() {
    return [];
  }

  query() {
    return {
      messages: [
        {
          id: null,
          created: null,
          from_type: null,
          from_id: null,
          to_type: null,
          to_id: null,
          subject: null,
          body: null,
          read: null,
          saved: null,
          deleted: null,
          thread_id: null,
          expire: null,
        },
      ],
    };
  }

  _change(table, _keys): void {
    const actions = this.redux.getActions("messages");
    if (actions == null) {
      throw Error("actions must be defined");
    }
    actions.handleTableUpdate(table.get().mapKeys(parseInt));
  }
}

class SentMessagesTable extends Table {
  constructor(name, redux) {
    super(name, redux);
    this.query = this.query.bind(this);
    this._change = this._change.bind(this);
  }

  options() {
    return [];
  }

  query() {
    return {
      sent_messages: [
        {
          id: null,
          created: null,
          from_type: null,
          from_id: null,
          to_type: null,
          to_id: null,
          subject: null,
          body: null,
          read: null,
          saved: null,
          thread_id: null,
        },
      ],
    };
  }

  _change(table, _keys): void {
    const actions = this.redux.getActions("messages");
    if (actions == null) {
      throw Error("actions must be defined");
    }
    actions.handleTableUpdate(table.get().mapKeys(parseInt));
  }
}

let initialized = false;
export function init() {
  if (initialized || redux.getStore("messages") != null) {
    return;
  }
  redux.createStore<MessagesState, MessagesStore>("messages", MessagesStore, {
    filter: "unread",
  });
  redux.createActions<MessagesState, MessagesActions>(
    "messages",
    MessagesActions,
  );
  redux.createTable("messages", MessagesTable);
  redux.createTable("sent_messages", SentMessagesTable);
  initialized = true;
}
