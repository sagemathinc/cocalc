/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";
import { ID } from "./crm";
import throttle from "@cocalc/util/api/throttle";

Table({
  name: "messages",
  fields: {
    id: ID,
    created: {
      type: "timestamp",
      desc: "when this message was created",
      not_null: true,
    },
    source_type: {
      type: "string",
      pg_type: "varchar(32)",
      desc: "What sort of thing created the message:  'project', 'system', 'account'",
      not_null: true,
    },
    source_id: {
      type: "uuid",
      desc: "A project_id when source='project' and an account_id when source='account'",
      not_null: true,
    },
    target_id: {
      type: "uuid",
      desc: "uuid of account that the message is being sent to",
      not_null: true,
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
    expire: {
      type: "timestamp",
      desc: "delete this row after this date, if not null",
    },
    thread_id: {
      type: "number",
      desc: "If this message is in a thread, this is the id of the root message.",
    },
  },
  rules: {
    primary_key: "id",
    pg_indexes: ["target_id", "created"],
    user_query: {
      get: {
        pg_changefeed: "messages",
        pg_where: [
          "created >= NOW() - interval '45 days'",
          { "account_id = $::UUID": "account_id" },
        ],
        options: [{ order_by: "-created" }, { limit: 500 }],
        throttle_changes: 2000,
        fields: {
          id: null,
          created: null,
          source_type: null,
          source_id: null,
          target_id: null,
          subject: null,
          body: null,
          read: null,
          saved: null,
          thread_id: null,
        },
      },
      set: {
        fields: {
          id: true,
          target_id: true,
          subject: true,
          body: true,
          // use read:0 to mark not read
          read: true,
          saved: true,
          thread_id: true,
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
          // const dbg = database._dbg("messages:instead_of_change");
          // dbg(JSON.stringify({ old_val, new_val, account_id }));
          if (old_val != null) {
            // setting saved or read
            try {
              // putting source_id in the query specifically as an extra security measure, so user can't change
              // message with id they don't own.
              await client.query(
                "UPDATE messages SET read=$3, saved=$4 WHERE source_type='account' AND source_id=$1 AND id=$2",
                [
                  account_id,
                  old_val.id,
                  (new_val.read === 0 ? null : new_val.read) ?? old_val.read,
                  new_val.saved ?? old_val.saved,
                ],
              );
              cb();
            } catch (err) {
              cb(`${err}`);
            }
          } else {
            // create a new message, since there are no option to edit anything except the read time.
            try {
              throttle({
                endpoint: "user_query-messages",
                account_id,
              });
              const { rows: counts } = await client.query(
                "SELECT COUNT(*) AS count FROM accounts WHERE account_id=$1",
                [new_val.target_id],
              );
              if (counts[0].count == 0) {
                cb(`target account_id ${new_val.target_id} does not exist`);
                return;
              }
              const { rows } = await client.query(
                `INSERT INTO messages(created,source_type,source_id,target_id,subject,body,thread_id)
                 VALUES(NOW(),'account',$1,$2,$3,$4,$5) RETURNING *
                `,
                [
                  account_id,
                  new_val.target_id,
                  new_val.subject,
                  new_val.body,
                  new_val.thread_id,
                ],
              );
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
