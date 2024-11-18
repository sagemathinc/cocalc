/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "@cocalc/frontend/app-framework/Table";
import { redux, Store, Actions } from "@cocalc/frontend/app-framework";
import type { Message } from "@cocalc/util/db-schema/messages";
import type { TypedMap } from "@cocalc/util/types/typed-map";
import type { Map } from "immutable";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export interface MessagesState {
  // map from string version of message id to immutablejs Message.
  messages?: Map<string, TypedMap<Message>>;
  sent_messages?: Map<string, TypedMap<Message>>;
}
export class MessagesStore extends Store<MessagesState> {}

export class MessagesActions extends Actions<MessagesState> {
  mark = ({
    id,
    read,
    saved,
  }: {
    id: number;
    read?: Date | null;
    saved?: boolean;
  }) => {
    redux
      .getTable("messages")
      .set({ id, read: read === null ? 0 : read, saved });
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

    const messages = table.get();
    actions.setState({ messages });
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

    const sent_messages = table.get();
    actions.setState({ sent_messages });
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
