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

This could be used for support purposes -- e.g., user sends message where
target type is to_type="support".  A support system needs to assign a person
to handle the message, and keep track of the status of it.  That extra information
does not get stored in this message, but instead in a new support table, which
references messages.

*/

import { Table } from "./types";
import { ID } from "./crm";
import throttle from "@cocalc/util/api/throttle";
import { SCHEMA as schema } from "./index";

export const NUM_MESSAGES = 300;

export type Entity = "project" | "system" | "support" | "account";

export interface Message {
  id: number;
  sent: Date;
  from_type: Entity;
  from_id: string; // a uuid
  to_type: Entity;
  to_id: string; // a uuid
  subject: string;
  body: string;
  read?: Date;
  saved?: boolean;
  deleted?: boolean;
  expire?: Date;
  // used for replies
  thread_id?: number;
}

Table({
  name: "messages",
  fields: {
    id: ID,
    sent: {
      type: "timestamp",
      desc: "When this message was actually sent.  A draft is a message where sent has not yet been set.",
    },
    from_type: {
      type: "string",
      pg_type: "varchar(32)",
      desc: "What sort of thing created the message:  'project', 'system', 'account', 'support'",
      not_null: true,
    },
    from_id: {
      type: "uuid",
      desc: "A project_id when from='project' and an account_id when from='account'.  For type='system', haven't decided what this is yet (maybe some hardcoded uuid's for different components of the system?).",
      not_null: true,
      render: { type: "account" },
    },
    to_type: {
      type: "string",
      pg_type: "varchar(32)",
      desc: "Type of thing the message is being sent to:  'project', 'system', 'account', 'support'",
      not_null: true,
    },
    to_id: {
      type: "uuid",
      desc: "uuid of account that the message is being sent to",
      not_null: true,
      render: { type: "account" },
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
    read: {
      type: "timestamp",
      desc: "when the message was read by the user, set this to the time when they read it.",
    },
    saved: {
      type: "boolean",
      desc: "If user saved this message for later.",
    },
    deleted: {
      type: "boolean",
      desc: "If recipient deleted this message.",
    },
    expire: {
      type: "timestamp",
      desc: "Recipient requested to permanently delete this message after this date.",
    },
    thread_id: {
      type: "number",
      desc: "If this message is in a thread, this is the id of the root message.",
    },
  },
  rules: {
    primary_key: "id",
    changefeed_keys: ["to_id", "sent"],
    pg_indexes: ["to_id", "to_type"],
    user_query: {
      get: {
        pg_where: [
          { "to_id = $::UUID": "account_id" },
          { "sent IS NOT $": null },
        ],
        options: [{ order_by: "-id" }, { limit: NUM_MESSAGES }],
        fields: {
          id: null,
          sent: null,
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
      },
      set: {
        fields: {
          id: true,
          // use read:0 to mark not read
          read: true,
          saved: true,
          deleted: true,
          thread_id: true,
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
            // setting saved or read
            try {
              // user is allowed to change messages *to* them only.
              const query =
                "UPDATE messages SET read=$3, saved=$4, deleted=$5, expire=$6 WHERE to_type='account' AND to_id=$1 AND id=$2";
              const params = [
                account_id,
                parseInt(old_val.id),
                new_val.read ?? old_val.read,
                new_val.saved ?? old_val.saved,
                new_val.deleted ?? old_val.deleted,
                // todo -- if set to 0, becomes null, so not deleted, but doesn't
                // get sync'd out either since sync doesn't support setting to null yet.
                new_val.expire === 0 || new Date(new_val.expire).valueOf() == 0
                  ? null
                  : (new_val.expire ?? old_val.expire),
              ];
              // putting from_id in the query specifically as an extra security measure, so user can't change
              // message with id they don't own.
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
  fields: schema.messages.fields,
  rules: {
    primary_key: schema.messages.primary_key,
    changefeed_keys: ["from_id"],
    virtual: "messages",
    user_query: {
      get: {
        ...schema.messages.user_query?.get!,
        pg_where: [{ "from_id = $::UUID": "account_id" }],
      },
      set: {
        fields: {
          id: true,
          to_type: true,
          to_id: true,
          subject: true,
          body: true,
          sent: true,
          thread_id: true,
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
              if (new_val.deleted || new_val.expire) {
                if (old_val.sent || new_val.sent) {
                  throw Error(
                    "cannot delete message after sending it (unsend it first)",
                  );
                }
              }
              // user is allowed to change subject/body/sent fields of messages *from* them only.
              const query =
                "UPDATE messages SET subject=$3,body=$4,sent=$5,deleted=$6,expire=$7 WHERE to_type='account' AND from_id=$1 AND id=$2";
              const params = [
                account_id,
                parseInt(old_val.id),
                new_val.subject ?? old_val.subject,
                new_val.body ?? old_val.body,
                new_val.sent === 0 || new Date(new_val.sent).valueOf() == 0
                  ? null
                  : (new_val.sent ?? old_val.sent),
                new_val.deleted ?? old_val.deleted,
                new_val.expire === 0 || new Date(new_val.expire).valueOf() == 0
                  ? null
                  : (new_val.expire ?? old_val.expire),
              ];
              // putting from_id in the query specifically as an extra security measure, so user can't change
              // message with id they don't own.
              await client.query(query, params);
              await database.updateUnreadMessageCount({ account_id });
              cb();
            } catch (err) {
              cb(`${err}`);
            }
          } else {
            // create a new message:
            try {
              throttle({
                endpoint: "user_query-messages",
                account_id,
              });
              const to_type = new_val.to_type;
              if (to_type == "account") {
                const { rows: counts } = await client.query(
                  "SELECT COUNT(*) AS count FROM accounts WHERE account_id=$1",
                  [new_val.to_id],
                );
                if (counts[0].count == 0) {
                  cb(`to account_id ${new_val.to_id} does not exist`);
                  return;
                }
              } else if (to_type == "system") {
              } else {
                cb(`unknown to_type=${to_type}`);
                return;
              }
              const { rows } = await client.query(
                `INSERT INTO messages(from_type,from_id,to_id,to_type,subject,body,thread_id,sent)
                 VALUES('account',$1,$2,$3,$4,$5,$6,$7) RETURNING *
                `,
                [
                  account_id,
                  new_val.to_id,
                  new_val.to_type,
                  new_val.subject,
                  new_val.body,
                  new_val.thread_id,
                  new_val.sent,
                ],
              );
              if (to_type == "account" && new_val.sent) {
                await database.updateUnreadMessageCount({
                  account_id: new_val.to_id,
                });
              }
              cb(undefined, rows[0]);
            } catch (err) {
              cb(`${err}`);
            }
          }
        },
      },
    },
  },
});

Table({
  name: "crm_messages",
  rules: {
    virtual: "messages",
    primary_key: "id",
    user_query: {
      get: {
        admin: true, // only admins can do get queries on this table
        fields: schema.messages.user_query?.get?.fields ?? {},
      },
    },
  },
  fields: schema.messages.fields,
});
