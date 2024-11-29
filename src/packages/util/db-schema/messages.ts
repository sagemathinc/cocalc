/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
This is a table to support a simple messages system in cocalc, to support sending and replying to
messages between these three classes of entities:

- cocalc system
- projects
- users

A message has a subject and body.

When it is read can be set, and a message can also be saved for later.

That's it!  This is meant to be just enough to support things like:

 - the system sending messages to users, e.g., reminds about notification
 - a user replying and sending a message to the system (which admins could see).
 - users sending messages to each other (and replying)
 - users send message to system
 - system send message to user
 - project sending messages to users (e.g., about something happening)

For simplicity there are no tags or any extra metadata -- put that in the markdown
in the body of the message.

On purpose, all messages are sent/received in one central place in the UI, NOT associated
to particular files/directories/projects.  Again, use links in the message for that.
*/

import { Table } from "./types";
import { ID } from "./crm";
import throttle from "@cocalc/util/api/throttle";
import { SCHEMA } from "./index";
import { isEqual } from "lodash";

// make this a bit big initially -- we'll add a feature to "load more", hopefully before
// this limit is a problem
export const NUM_MESSAGES = 1000;

export interface Message {
  id: number;
  sent: Date;
  from_id: string; // a uuid
  to_ids: string[]; // array of uuid's
  subject: string;
  body: string;
  // used for replies
  thread_id?: number;
  read?: string;
  saved?: string;
  deleted?: string;
  expire?: string;
}

export const BITSET_FIELDS = ["read", "saved", "deleted", "expire"] as const;

export type BitSetField = (typeof BITSET_FIELDS)[number];

export function isBitSetField(x): x is BitSetField {
  return typeof x == "string" && BITSET_FIELDS.includes(x as any);
}

Table({
  name: "messages",
  fields: {
    id: ID,
    sent: {
      type: "timestamp",
      desc: "When this message was actually sent.  A draft is a message where sent has not yet been set.",
    },
    from_id: {
      type: "uuid",
      desc: "A project_id when from='project' and an account_id when from='account'.  For type='system', haven't decided what this is yet (maybe some hardcoded uuid's for different components of the system?).",
      not_null: true,
      render: { type: "account" },
    },
    to_ids: {
      type: "array",
      pg_type: "UUID[]",
      desc: "array of uuid's of account that the message is being sent to",
      not_null: true,
      render: { type: "accounts" },
    },
    subject: {
      type: "string",
      desc: "Subject of the message.",
      not_null: true,
    },
    body: {
      type: "string",
      desc: "Body of the message (should be formatted as markdown).",
      not_null: true,
    },
    thread_id: {
      type: "number",
      desc: "If this message is in a thread, this is the id of the root message.",
    },
    // The rest are status bitsets, with bit 0 corresponds to from_id, and bits 1 to n corresponding
    // the users receiving the message, according to the ids in to_ids.
    read: {
      type: "string",
      pg_type: "bit varying",
      desc: "User read this message.",
    },
    saved: {
      type: "string",
      pg_type: "bit varying",
      desc: "Users that saved this message for later (so no longer in inbox)",
    },
    deleted: {
      type: "string",
      pg_type: "bit varying",
      desc: "If user deleted this message (so in the trash).",
    },
    expire: {
      type: "string",
      pg_type: "bit varying",
      desc: "User permanently deleted this message. ",
    },
  },
  rules: {
    primary_key: "id",
    changefeed_keys: ["to_ids", "sent"],
    pg_indexes: ["USING GIN (to_ids)"],
    user_query: {
      get: {
        pg_where: [
          { "$::UUID = ANY(to_ids)": "account_id" },
          { "sent IS NOT $": null },
        ],
        options: [{ order_by: "-id" }, { limit: NUM_MESSAGES }],
        fields: {
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
      },
      set: {
        fields: {
          id: true,
          read: true,
          saved: true,
          deleted: true,
          expire: true,
        },
        async instead_of_change(
          database,
          old_val,
          new_val,
          account_id,
          cb,
        ): Promise<void> {
          const client = database._client();
          if (client == null) {
            cb("database not connected -- try again later");
            return;
          }
          if (old_val != null) {
            // const dbg = database._dbg("messages:instead_of_change");

            // It took me a long time to figure out that this is the way to flip bits without changing what is there, which
            // we need to do in order avoid a race condition, where two users say both mark a message read at almost the
            // same time, and they both write out 01 and 10 for the read bitset... with last write wins, the database would
            // end up with either 01 or 10, and one person's value is lost.  That's sill. With just directly changing *only*
            // the user's bit, we always end up with 11.  And this code illustrates how to change one bit.  Here "20" is
            // the number of users (so number of recipients + 1), and 3 is the position to flip (+1 since it is 1-indexed in postgres),
            // and it's `'x'::bit(1),3+1` to set the bit to x (=0 or 1), i.e., 0 in this example:
            //
            // smc=# update messages set saved=overlay(coalesce(saved,'0'::bit(1))::bit(20),'0'::bit(1),3+1) where id=61; select saved from messages where id=61;

            const ids = new_val.to_ids ?? old_val.to_ids ?? [];
            const numUsers = ids.length;
            let userIndex = -1;
            const setBit = (field: BitSetField, value: string) => {
              if (userIndex == -1) {
                // compute it first time, if needed
                const n = ids.indexOf(account_id);
                if (n == -1) {
                  throw Error(
                    "you do not have permission to edit this message",
                  );
                }
                userIndex = n + 1; // +1 to account for from_id
              }
              // ignore everything in value except the userIndex position.
              const bit = value[userIndex] ?? "0";
              if (bit != "0" && bit != "1") {
                // be especially careful to avoid sql injection attack.
                throw Error(`invalid bit '${bit}'`);
              }
              return `${field} = overlay(coalesce(${field},'0'::bit(1))::bit(${numUsers}),'${bit}'::bit(1),${userIndex}+1)`;
            };

            const v: string[] = [];
            for (const field of BITSET_FIELDS) {
              if (new_val[field] != null && new_val[field] != old_val[field]) {
                v.push(setBit(field, new_val[field]));
              }
            }

            if (v.length == 0) {
              // nothing changed
              cb();
              return;
            }

            try {
              const query = `UPDATE messages SET ${v.join(",")}  WHERE $1=ANY(to_ids) AND id=$2`;
              const params = [account_id, parseInt(old_val.id)];
              await client.query(query, params);
              await database.updateUnreadMessageCount({ account_id });
              cb();
            } catch (err) {
              cb(`${err}`);
            }
          } else {
            cb(`use the sent_messages table to create a new message`);
          }
        },
      },
    },
  },
});

Table({
  name: "sent_messages",
  fields: SCHEMA.messages.fields,
  rules: {
    primary_key: SCHEMA.messages.primary_key,
    changefeed_keys: ["from_id"],
    virtual: "messages",
    user_query: {
      get: {
        ...SCHEMA.messages.user_query?.get!,
        pg_where: [{ "from_id = $::UUID": "account_id" }],
      },
      set: {
        fields: {
          id: true,
          to_ids: true,
          subject: true,
          body: true,
          sent: true,
          thread_id: true,
          saved: true,
          read: true,
          deleted: true,
          expire: true,
        },
        async instead_of_change(
          database,
          old_val,
          new_val,
          account_id,
          cb,
        ): Promise<void> {
          const client = database._client();
          if (client == null) {
            cb("database not connected -- try again later");
            return;
          }
          if (old_val != null) {
            try {
              if (old_val.sent) {
                // once a message is sent, the ONLY thing you can change are BITSET_FIELDS.
                for (const field in new_val) {
                  // @ts-ignore
                  if (!BITSET_FIELDS.includes(field)) {
                    delete new_val[field];
                  }
                }
                // TODO: we might later have a notion of editing messages after they are sent, but this will
                // be by adding one or more patches, so the edit history is clear.
              }
              if (
                new_val.to_ids != null &&
                !isEqual(new_val.to_ids, old_val.to_ids)
              ) {
                await assertToIdsAreValid({ client, to_ids: new_val.to_ids });
              }

              const setBit = (field: BitSetField, value: string) => {
                const numUsers =
                  1 + (new_val.to_ids ?? old_val.to_ids ?? []).length;
                const bit = value[0] ?? "0";
                if (bit != "0" && bit != "1") {
                  throw Error(`invalid bit '${bit}'`);
                }
                return `${field} = overlay(coalesce(${field},'0'::bit(1))::bit(${numUsers}),'${bit}'::bit(1),1)`;
              };
              const v: string[] = [];
              for (const field of BITSET_FIELDS) {
                if (
                  new_val[field] != null &&
                  new_val[field] != old_val[field]
                ) {
                  v.push(setBit(field, new_val[field]));
                }
              }
              const bitsets = v.length == 0 ? "" : "," + v.join(",");

              // user is allowed to change a lot about messages *from* them only.
              // putting from_id in the query specifically as an extra security measure, so user can't change
              // message with id they don't own.
              const query = `UPDATE messages SET to_ids=$3,subject=$4,body=$5,sent=$6,thread_id=$7 ${bitsets} WHERE from_id=$1 AND id=$2`;
              const params = [
                account_id,
                parseInt(old_val.id),
                new_val.to_ids ?? old_val.to_ids,
                new_val.subject ?? old_val.subject,
                new_val.body ?? old_val.body,
                new_val.sent ?? old_val.sent,
                new_val.thread_id ?? old_val.thread_id,
              ];
              await client.query(query, params);
              const to_ids = new_val.to_ids ?? old_val.to_ids;
              if (to_ids && (new_val.sent ?? old_val.sent)) {
                for (const account_id of to_ids) {
                  await database.updateUnreadMessageCount({
                    account_id,
                  });
                }
              }
              cb();
            } catch (err) {
              cb(`${err}`);
            }
          } else {
            // create a new message:
            cb("use the create_message virtual table to create messages");
          }
        },
      },
    },
  },
});

async function assertToIdsAreValid({ client, to_ids }) {
  const { rows } = await client.query(
    "SELECT account_id FROM accounts WHERE account_id=ANY($1)",
    [to_ids],
  );
  if (rows.length != to_ids.length) {
    const exist = new Set(rows.map(({ account_id }) => account_id));
    const missing = to_ids.filter((account_id) => !exist.has(account_id));
    if (missing.length > 0) {
      throw Error(
        `every target account_id must exist -- these accounts do not exist: ${JSON.stringify(missing)}`,
      );
    }
  }
}

// See comment in groups -- for create_groups.
Table({
  name: "create_message",
  rules: {
    virtual: "messages",
    primary_key: "id",
    user_query: {
      get: {
        fields: {
          id: null,
          to_ids: null,
          subject: null,
          body: null,
          sent: null,
          thread_id: null,
        },
        async instead_of_query(database, opts, cb): Promise<void> {
          try {
            const { account_id } = opts;
            throttle({
              endpoint: "user_query-create_message",
              account_id,
            });
            const client = database._client();
            const query = opts.query ?? {};
            const to_ids = Array.from(new Set(query.to_ids));
            await assertToIdsAreValid({ client, to_ids });
            const { rows } = await client.query(
              `INSERT INTO messages(from_id,to_ids,subject,body,thread_id,sent)
                 VALUES($1::UUID,$2::UUID[],$3,$4,$5,$6) RETURNING *
                `,
              [
                account_id,
                to_ids,
                opts.query.subject,
                opts.query.body,
                opts.query.thread_id,
                opts.query.sent,
              ],
            );
            if (opts.query.sent) {
              for (const account_id of to_ids) {
                await database.updateUnreadMessageCount({
                  account_id,
                });
              }
            }
            cb(undefined, rows[0]);
          } catch (err) {
            cb(`${err}`);
          }
        },
      },
    },
  },
  fields: SCHEMA.groups.fields,
});

Table({
  name: "crm_messages",
  rules: {
    virtual: "messages",
    primary_key: "id",
    user_query: {
      get: {
        admin: true, // only admins can do get queries on this table
        fields: SCHEMA.messages.user_query?.get?.fields ?? {},
      },
    },
  },
  fields: SCHEMA.messages.fields,
});
