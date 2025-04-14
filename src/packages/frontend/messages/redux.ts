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
  isToMe,
  isFromMe,
  isDeleted,
  isDraft,
  get,
  getThread,
  getThreadId,
  replySubject,
  forwardSubject,
  getNotExpired,
  getThreads,
  setBitField,
  participantsInThread,
  excludeSelfUnlessAlone,
} from "./util";
import { debounce } from "lodash";
import { init as initGroups } from "@cocalc/frontend/groups/redux";
import { BITSET_FIELDS } from "@cocalc/util/db-schema/messages";
import { once } from "@cocalc/util/async-utils";
import type { TypedMap } from "@cocalc/util/types/typed-map";

const DEFAULT_FONT_SIZE = 14;

type Command = TypedMap<{ name: string; counter: number }>;

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
  command: Command;
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

  command = (name) => {
    const counter = this.getStore().getIn(["command", "counter"], 0) + 1;
    // @ts-ignore
    this.setState({ command: { name, counter } });
  };

  mark = async (obj: {
    id?: number;
    ids?: Set<number>;
    read?: boolean;
    saved?: boolean;
    starred?: boolean;
    liked?: boolean;
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
          table.set(setMessage({ message, obj }));
          changed_table = true;
        }

        if (obj.liked && isToMe(message) && isFromMe(message)) {
          // ensure like is only set once in this case.
          obj = { ...obj, liked: false };
        }

        message = sent_table.get_one(`${id}`);
        if (message != null) {
          sent_table.set(setMessage({ message, obj, account_id: 0 }));
          if (
            !message.get("sent") &&
            message.get("to_ids")?.includes(webapp_client.account_id)
          ) {
            // annoying special case -- marking a message that has not been sent yet,
            // which includes me as a recipient. Because it isn't sent yet it does
            // not appear in the first table above, so only gets half marked.
            await webapp_client.async_query({
              query: { messages: setMessage({ message, obj }) },
            });
          }
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

  handleTableUpdate = (messages) => {
    messages = getNotExpired(messages);
    const store = this.getStore();
    messages = messages.merge(store.get("messages"));
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
    const table = this.redux.getTable("sent_messages")._table;
    //     const current = table.get_one(`${obj.id}`);
    //     if (current == null) {
    //       throw Error("message does not exist in sent_messages table");
    //     }
    const debounceSave = obj.debounceSave;
    delete obj.debounceSave;
    // sets it in the local table so it's there when you come back.
    table.set(obj, "shallow");
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
    replyAll?: boolean;
  }) => {
    let to_ids: string[];
    if (replyAll) {
      const store = this.getStore();
      const threads = store.get("threads");
      to_ids = excludeSelfUnlessAlone(
        participantsInThread({ message, threads }),
      );
    } else {
      to_ids =
        message.from_id == webapp_client.account_id
          ? [message.to_ids[0]]
          : [message.from_id];
    }

    const subject = replySubject(message.subject);
    return await this.createDraft({
      to_ids,
      thread_id: getThreadId(message),
      subject,
      body: "",
    });
  };

  createForward = async ({
    message,
    forwardAll,
  }: {
    message: Message;
    forwardAll?: boolean;
  }) => {
    const subject = forwardSubject(message.subject);
    const store = this.redux.getStore("users");
    const w: string[] = [];
    const header =
      "&nbsp;\n\n&nbsp;\n\n&nbsp;\n\n---------- Forwarded message ---------\n\n";
    const messages = forwardAll
      ? getThread({ message, threads: this.getStore().get("threads") })
      : [message];
    for (const mesg of messages) {
      const from = store.get_name(get(mesg, "from_id"));
      const to: string[] = [];
      for (const account_id of get(mesg, "to_ids")) {
        const name = store.get_name(account_id);
        if (name?.trim()) {
          to.push(name);
        }
      }
      w.push(`
${get(mesg, "sent") ? `- Date: ${get(mesg, "sent").toLocaleString()}` : ""}
${from ? "- From: " + from : ""}
- Subject: ${get(mesg, "subject")}
${to.length > 0 ? "- To: " + to.join(", ") : ""}

<br/>

${get(mesg, "body")}
`);
    }

    return await this.createDraft({
      to_ids: [],
      thread_id: getThreadId(message),
      subject,
      body: header + w.join(header),
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
${isDeleted(message) ? "trash" : ""}
${isDraft(message) ? "draft" : ""}

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

  search = async (query: string) => {
    if (!query.trim()) {
      // easy special case
      this.setState({ search: new Set(), searchWords: new Set() });
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
  };

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
          starred: null,
          liked: null,
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
          starred: null,
          liked: null,
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
    command: { name: "", counter: 0 },
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

function setMessage({
  message,
  obj,
  account_id,
}: {
  message;
  obj;
  account_id?;
}) {
  const x: any = { id: message.get("id") };
  for (const field of BITSET_FIELDS) {
    if (obj[field] != null) {
      message = setBitField(message, field, obj[field], account_id);
      x[field] = message.get(field);
    }
  }
  return x;
}
