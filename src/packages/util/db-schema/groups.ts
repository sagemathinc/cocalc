/*
 *  This file is part of CoCalc: Copyright © 2020-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Groups of cocalc accounts.
*/

import { uuid } from "../misc";
import { SCHEMA } from "./index";
import { Table } from "./types";

type DbClient = {
  query: (...args: any[]) => Promise<any>;
  release: () => void;
};

export interface Group {
  // primary key: a uuid
  group_id: string;
  // owners -- uuids of owners of the group
  owner_account_ids?: string[];
  //  members -- uuids of members of the group
  member_account_ids?: string[];
  // the title
  title?: string;
  color?: string;
  // account that will be charged for any resource owned by the group
  billing_account_id?: string;
}

export const MAX_TITLE_LENGTH = 1024;
export const MAX_COLOR_LENGTH = 30;

Table({
  name: "groups",
  fields: {
    group_id: {
      type: "uuid",
      desc: "Unique id of this group of accounts.",
    },
    owner_account_ids: {
      type: "array",
      pg_type: "UUID[]",
      desc: "Unique id's of owners of this group.  They can add/remove members or other owners.  This can be null, e.g., for implicitly created groups (e.g., to send a group message), there's no need for a management.",
    },
    member_account_ids: {
      type: "array",
      pg_type: "UUID[]",
      desc: "Unique id's of members of this group.",
    },
    billing_account_id: {
      type: "uuid",
      desc: "Account_id that will be **charged money** for any resource owned by the group.",
      render: { type: "account" },
      title: "Billing Account",
    },
    title: {
      type: "string",
      pg_type: `VARCHAR(${MAX_TITLE_LENGTH})`,
      desc: "Title of this group of accounts",
    },
    color: {
      type: "string",
      desc: "A user configurable color.",
      pg_type: `VARCHAR(${MAX_COLOR_LENGTH})`,
      render: { type: "color", editable: true },
    },
  },
  rules: {
    primary_key: "group_id",
    pg_indexes: [
      "USING GIN (owner_account_ids)",
      "USING GIN (member_account_ids)",
    ],
    changefeed_keys: ["owner_account_ids"],
    user_query: {
      get: {
        pg_where: [{ "$::UUID = ANY(owner_account_ids)": "account_id" }],
        fields: {
          group_id: null,
          owner_account_ids: null,
          member_account_ids: null,
          title: null,
          color: null,
        },
      },
      set: {
        fields: {
          group_id: true,
          owner_account_ids: true,
          member_account_ids: true,
          title: true,
          color: true,
        },
        async check_hook(database, query, account_id, _project_id, cb) {
          // for sets we have to manually check that the this user is an owner, because
          // we didn't implement something like `project_id: "project_write"` which is
          // usually used for validating writes.  Also the where above is obviously
          // only for gets and changefeeds.
          try {
            const { rows } = await database._pool.query(
              "SELECT COUNT(*) AS count FROM groups WHERE $1=ANY(owner_account_ids) AND group_id=$2",
              [account_id, query?.group_id],
            );
            if (rows[0].count != 1) {
              throw Error("user must be an owner of the group");
            }
            cb();
          } catch (err) {
            cb(`${err}`);
          }
        },
      },
    },
  },
});

// Use the create_groups virtual table to create a new group.
// We have to do this, since users shouldn't assign uuid's
// AND our check_hook above prevents a user from writing
// to a group if they don't already own it, and they don't
// own one they are creating.
// This is a get query, because you do a get for
//   {group_id:null, owner_account_ids:...}
// and the group_id gets filled in with your new record's id.
Table({
  name: "create_group",
  rules: {
    virtual: "groups",
    primary_key: "group_id",
    user_query: {
      get: {
        fields: {
          group_id: null,
          owner_account_ids: null,
          member_account_ids: null,
          title: null,
          color: null,
        },
        async instead_of_query(database, opts, cb): Promise<void> {
          let client: DbClient | undefined;
          try {
            // server assigned:
            const group_id = uuid();
            client = await database._get_query_client();
            if (!client) {
              cb("database not connected -- try again later");
              return;
            }
            const query = opts.query ?? {};
            const owner_account_ids = [...query.owner_account_ids];
            if (!owner_account_ids.includes(opts.account_id)) {
              owner_account_ids.push(opts.account_id);
            }
            const { member_account_ids, title, color } = query;
            await client.query(
              "INSERT INTO groups(group_id, owner_account_ids, member_account_ids, title, color) VALUES($1,$2,$3,$4,$5)",
              [group_id, owner_account_ids, member_account_ids, title, color],
            );
            cb(undefined, {
              group_id,
              owner_account_ids,
              member_account_ids,
              title: title?.slice(0, MAX_TITLE_LENGTH),
              color: color?.slice(0, MAX_COLOR_LENGTH),
            });
          } catch (err) {
            cb(`${err}`);
          } finally {
            client?.release();
          }
        },
      },
    },
  },
  fields: SCHEMA.groups.fields,
});

Table({
  name: "crm_groups",
  rules: {
    virtual: "groups",
    primary_key: "group_id",
    user_query: {
      get: {
        admin: true,
        fields: SCHEMA.groups.user_query?.get?.fields ?? {},
      },
    },
  },
  fields: SCHEMA.groups.fields,
});
