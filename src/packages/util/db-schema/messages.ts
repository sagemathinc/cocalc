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
import { SCHEMA as schema } from "./index";

// make this a bit big initially -- we'll add a feature to "load more", hopefully before
// this limit is a problem
export const NUM_MESSAGES = 1000;

export interface Message {
  id: number;
  sent: Date;
  from_id: string; // a uuid
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
    from_id: {
      type: "uuid",
      desc: "A project_id when from='project' and an account_id when from='account'.  For type='system', haven't decided what this is yet (maybe some hardcoded uuid's for different components of the system?).",
      not_null: true,
      render: { type: "account" },
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
    to_deleted: {
      type: "boolean",
      desc: "If recipient deleted this message.",
    },
    from_deleted: {
      type: "boolean",
      desc: "If sender deleted this message.",
    },
    to_expire: {
      type: "timestamp",
      desc: "Recipient requested to permanently delete this message.   The message is permanently deleted by a maintenance process when to_expire and from_expire are both set and in the past. (One exception -- if from_expire is set and the message wasn't sent then it also gets permanently deleted.)",
    },
    from_expire: {
      type: "timestamp",
      desc: "Sender requested to permanently delete this message. ",
    },
    thread_id: {
      type: "number",
      desc: "If this message is in a thread, this is the id of the root message.",
    },
  },
  rules: {
    primary_key: "id",
    changefeed_keys: ["to_id", "sent"],
    pg_indexes: ["to_id"],
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
          from_id: null,
          to_id: null,
          subject: null,
          body: null,
          read: null,
          saved: null,
          thread_id: null,
          from_deleted: null,
          from_expire: null,
          to_deleted: null,
          to_expire: null,
        },
      },
      set: {
        fields: {
          id: true,
          // use read:0 to mark not read
          read: true,
          saved: true,
          to_deleted: true,
          to_expire: true,
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
              // user is allowed to change messages *to* them only, and then
              // only limited fields.
              const query =
                "UPDATE messages SET read=$3, saved=$4, to_deleted=$5, to_expire=$6 WHERE AND to_id=$1 AND id=$2";
              const params = [
                account_id,
                parseInt(old_val.id),
                new_val.read ?? old_val.read,
                new_val.saved ?? old_val.saved,
                new_val.to_deleted ?? old_val.to_deleted,
                // todo -- if set to 0, becomes null, so not to_deleted, but doesn't
                // get sync'd out either since sync doesn't support setting to null yet.
                new_val.to_expire === 0 ||
                new Date(new_val.to_expire).valueOf() == 0
                  ? null
                  : (new_val.to_expire ?? old_val.to_expire),
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
          to_id: true,
          subject: true,
          body: true,
          sent: true,
          thread_id: true,
          from_deleted: true,
          from_expire: true,
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
                // once a message is sent, the ONLY thing you can change is from_deleted and from_expire.
                // frontend client enforces this, but we also enforce it here by only whitelisting those
                // two properties.
                new_val = {
                  from_deleted: new_val.from_deleted,
                  from_expire: new_val.from_expire,
                };
                // TODO: we do plan to have a notion of editing messages after they are sent, but this will
                // be by adding one or more patches, so the edit history is clear.
              }
              // user is allowed to change a lot about messages *from* them only.
              const query =
                "UPDATE messages SET to_id=$3,subject=$4,body=$5,sent=$6,from_deleted=$7,from_expire=$8,thread_id=$9 WHERE AND from_id=$1 AND id=$2";
              const params = [
                account_id,
                parseInt(old_val.id),
                new_val.to_id ?? old_val.to_id,
                new_val.subject ?? old_val.subject,
                new_val.body ?? old_val.body,
                new_val.sent ?? old_val.sent,
                new_val.from_deleted ?? old_val.from_deleted,
                new_val.from_expire ?? old_val.from_expire,
                new_val.thread_id ?? old_val.thread_id,
              ];
              // putting from_id in the query specifically as an extra security measure, so user can't change
              // message with id they don't own.
              await client.query(query, params);
              if (new_val.to_id ?? old_val.to_id) {
                await database.updateUnreadMessageCount({
                  account_id: new_val.to_id ?? old_val.to_id,
                });
              }
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
              const { rows: counts } = await client.query(
                "SELECT COUNT(*) AS count FROM accounts WHERE account_id=$1",
                [new_val.to_id],
              );
              if (counts[0].count == 0) {
                cb(`to account_id ${new_val.to_id} does not exist`);
                return;
              }
              const { rows } = await client.query(
                `INSERT INTO messages(from_id,to_id,subject,body,thread_id,sent)
                 VALUES($1,$2,$3,$4,$5) RETURNING *
                `,
                [
                  account_id,
                  new_val.to_id,
                  new_val.subject,
                  new_val.body,
                  new_val.thread_id,
                  new_val.sent,
                ],
              );
              if (new_val.sent) {
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
