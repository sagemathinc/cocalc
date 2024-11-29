/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "@cocalc/frontend/app-framework/Table";
import { redux, Store, Actions } from "@cocalc/frontend/app-framework";
import type { iMessagesMap, iThreads, Message } from "./types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { search_split } from "@cocalc/util/misc";
import searchFilter from "@cocalc/frontend/search/filter";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import {
  getThreadId,
  replySubject,
  getNotExpired,
  getThreads,
  setBitField,
} from "./util";
import { debounce, throttle } from "lodash";
import { init as initGroups } from "@cocalc/frontend/groups/redux";
import { BITSET_FIELDS } from "@cocalc/util/db-schema/messages";
import { once } from "@cocalc/util/async-utils";

const DEFAULT_FONT_SIZE = 14;

export interface MessagesState {
  // map from string version of message id to immutablejs Message.
  messages?: iMessagesMap;
  threads?: iThreads;
  search: Set<number>;
  searchWords: Set<string>;
  // show/hide the compose modal
  compose?: boolean;
  // error to display to user
  error: string;
  fontSize: number;
}
export class MessagesStore extends Store<MessagesState> {}

export class MessagesActions extends Actions<MessagesState> {
  searchIndex: {
    messages: iMessagesMap | null;
    filter: (search: string) => Promise<number[]>;
  } = { messages: null, filter: async (_search: string) => [] };

  constructor(name, redux) {
    super(name, redux);
  }

  getStore = () => this.redux.getStore("messages");

  setError = (error: string) => {
    this.setState({ error });
  };

  mark = async (obj: {
    id?: number;
    ids?: Set<number>;
    read?: boolean;
    saved?: boolean;
    deleted?: boolean;
    expire?: boolean;
  }) => {
    let { id, ids } = obj;
    const table = this.redux.getTable("messages")._table;
    const sent_table = this.redux.getTable("sent_messages")._table;
    if (id != null) {
      if (ids != null) {
        ids.add(id);
      } else {
        ids = new Set([id]);
      }
    }
    if (ids != null && ids.size > 0) {
      // mark them all read or saved -- have to use _table to
      // change more than one record at a time.
      let changed_table = false;
      let changed_sent_table = false;
      for (const id of ids) {
        let message = table.get_one(`${id}`);
        if (message != null) {
          const x: any = { id };
          for (const field of BITSET_FIELDS) {
            if (obj[field] != null) {
              message = setBitField(message, field, obj[field]);
              x[field] = message.get(field);
            }
          }
          table.set(x);
          changed_table = true;
        }
        message = sent_table.get_one(`${id}`);
        if (message != null) {
          const x: any = { id };
          for (const field of BITSET_FIELDS) {
            if (obj[field] != null) {
              message = setBitField(message, field, obj[field], 0);
              x[field] = message.get(field);
            }
          }
          sent_table.set(x);
          changed_sent_table = true;
        }
      }
      if (changed_table) {
        await table.save();
      }
      if (changed_sent_table) {
        await sent_table.save();
      }
    }
  };

  handleTableUpdate = (updatedMessages) => {
    const store = this.getStore();
    let messages = store.get("messages");
    if (messages == null) {
      messages = updatedMessages;
    } else {
      messages = messages.merge(updatedMessages);
    }
    messages = getNotExpired(messages);
    const threads = getThreads(messages);
    this.setState({ messages, threads });
  };

  updateDraft = async (obj: {
    id: number;
    thread_id?: number;
    to_ids?: string[];
    subject?: string;
    body?: string;
    sent?: Date;
    debounceSave?: boolean;
  }) => {
    console.log("updateDraft", { subject: obj.subject });
    const table = this.redux.getTable("sent_messages")._table;
    //     const current = table.get_one(`${obj.id}`);
    //     if (current == null) {
    //       throw Error("message does not exist in sent_messages table");
    //     }
    const debounceSave = obj.debounceSave;
    delete obj.debounceSave;
    // sets it in the local table so it's there when you come back.
    table.set(obj);
    if (debounceSave) {
      this.debounceSaveSentMessagesTable();
    } else {
      await this.saveSentMessagesTable();
    }
  };

  private saveSentMessagesTable = async () => {
    const table = this.redux.getTable("sent_messages")._table;
    await table.save();
  };

  private debounceSaveSentMessagesTable = debounce(
    async () => {
      try {
        await this.saveSentMessagesTable();
      } catch (err) {
        console.warn(err);
      }
    },
    5000,
    { leading: false, trailing: true },
  );

  createDraft = async ({
    to_ids,
    subject = "",
    body = "",
    thread_id,
    sent,
  }: {
    to_ids: string[];
    subject?: string;
    body?: string;
    thread_id?: number;
    sent?: Date;
  }) => {
    const { query } = await webapp_client.async_query({
      query: {
        create_message: {
          id: null,
          subject,
          body,
          to_ids,
          thread_id,
          sent,
        },
      },
    });
    const id = query.create_message.id;
    // We could make sure this new message is immediately also in our local table
    // (instead of having to wait a second for it to come back via changefeed)
    // as follows, but that introduces a race condition if the user creates
    // a draft and stops editing it 1-2 seconds later, then comes back, since
    // their last keystroke will get overwritten when the initially created
    // draft comes back from the database.
    //     const sent_table = this.redux.getTable("sent_messages")._table;
    //     sent_table.set({ id, subject, body, to_ids, thread_id, sent });
    // wait for the message to exist locally in our table.
    const store = this.getStore();
    while (store.get("messages")?.get(id) == null) {
      await once(store, "change");
    }
    return id;
  };

  createReply = async ({
    message,
    replyAll,
  }: {
    message: Message;
    replyAll?: boolean | string[];
  }) => {
    let to_ids;
    if (replyAll) {
      to_ids = (typeof replyAll != "boolean" ? replyAll : message.to_ids)
        .filter((account_id) => account_id != webapp_client.account_id)
        .concat([message.from_id]);
    } else {
      to_ids = [message.from_id];
    }

    const subject = replySubject(message.subject);
    return await this.createDraft({
      to_ids,
      thread_id: getThreadId(message),
      subject,
      body: "",
    });
  };

  updateSearchIndex = reuseInFlight(
    async (opts: { noRetryIfMissing?: boolean; force?: boolean } = {}) => {
      const store = this.getStore();
      const messages = store.get("messages");
      if (messages == null) {
        // nothing to do
        return;
      }
      if (!opts.force && messages.equals(this.searchIndex.messages)) {
        // already up to date
        return;
      }
      const data = messages.keySeq().toJS();
      const users = this.redux.getStore("users");

      const missingUsers = new Set<string>();
      const getName = (account_ids: string[] | undefined) => {
        if (!account_ids) {
          return "";
        }
        const v: string[] = [];
        for (const account_id of account_ids) {
          const name = users.get_name(account_id);
          if (name == null) {
            missingUsers.add(account_id);
          }
          if (name) {
            v.push(name);
          }
        }
        return v.join(", ");
      };
      const toString = (id) => {
        const message = messages.get(id);
        if (message == null) {
          return "";
        }

        // todo -- adapt for non-accounts

        const s = `
From: ${getName([message.get("from_id")])}

To: ${getName(message.get("to_ids")?.toJS())}

Subject: ${message.get("subject")}

Body: ${message.get("body")}
`;

        return s;
      };
      const filter = await searchFilter<number>({
        data,
        toString,
      });

      this.searchIndex = { messages, filter };

      if (!opts.noRetryIfMissing && missingUsers.size > 0) {
        // after returning, we fire off loading of names
        // of all missing users, then redo the search index.
        // Otherwise non-collaborators will be missing in the
        // search index until store.get('messages') changes again.
        setTimeout(async () => {
          try {
            const actions = this.redux.getActions("users");
            await Promise.all(
              Array.from(missingUsers).map((account_id) =>
                actions.fetch_non_collaborator(account_id),
              ),
            );
            await this.updateSearchIndex({
              force: true,
              noRetryIfMissing: true,
            });
          } catch (err) {
            console.warn(err);
          }
        }, 1);
      }
    },
  );

  search = throttle(
    async (query: string) => {
      if (!query.trim()) {
        // easy special case
        this.setState({ search: new Set() });
        return;
      }
      // used for highlighting
      const searchWords = new Set(
        search_split(query, false).filter((x) => typeof x == "string"),
      );
      this.setState({ searchWords });
      // update search index, if necessary
      await this.updateSearchIndex();
      // the matching results
      const search = new Set(await this.searchIndex.filter(query));
      this.setState({ search });

      // change folder if necessary
      this.redux.getActions("mentions").set_filter("messages-search");
    },
    300,
    { leading: true, trailing: true },
  );

  setFontSize = (fontSize: number) => {
    fontSize = Math.max(5, Math.min(fontSize, 100));
    this.setState({ fontSize });
    localStorage.messagesFontSize = `${fontSize}`;
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
          sent: null,
          from_id: null,
          to_ids: null,
          subject: null,
          body: null,
          thread_id: null,
          read: null,
          saved: null,
          deleted: null,
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
          sent: null,
          from_id: null,
          to_ids: null,
          subject: null,
          body: null,
          thread_id: null,
          read: null,
          saved: null,
          deleted: null,
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

let initialized = false;
export function init() {
  if (initialized || redux.getStore("messages") != null) {
    return;
  }
  redux.createStore<MessagesState, MessagesStore>("messages", MessagesStore, {
    search: new Set<number>(),
    searchWords: new Set<string>(),
    error: "",
    fontSize: loadFontSize(),
  });
  redux.createActions<MessagesState, MessagesActions>(
    "messages",
    MessagesActions,
  );
  redux.createTable("messages", MessagesTable);
  redux.createTable("sent_messages", SentMessagesTable);
  // we also initialize the groups redux stuff if it isn't already done
  initGroups();
  initialized = true;
}

function loadFontSize() {
  try {
    const n = parseInt(localStorage.messagesFontSize ?? "${DEFAULT_FONT_SIZE}");
    return isNaN(n) ? DEFAULT_FONT_SIZE : n;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}
