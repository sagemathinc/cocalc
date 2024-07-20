/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

/*
Tracking web-analytics
this records data about users hitting cocalc and cocalc-related websites
this table is 100% back-end only.
*/
Table({
  name: "analytics",
  rules: {
    primary_key: ["token"],
    pg_indexes: ["token", "data_time"],
    durability: "soft",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          token: null,
          data: null,
          data_time: null,
          account_id: null,
          account_id_time: null,
          expire: null,
        },
      },
    },
  },
  fields: {
    token: {
      type: "uuid",
    },
    data: {
      type: "map",
      desc: "referrer, landing page, utm, etc.",
    },
    data_time: {
      type: "timestamp",
      desc: "when the data field was set",
    },
    account_id: {
      type: "uuid",
      desc: "set only once, when the user (eventually) signs in",
    },
    account_id_time: {
      type: "timestamp",
      desc: "when the account id was set",
    },
    expire: {
      type: "timestamp",
      desc: "future date, when the entry will be deleted",
    },
  },
});

/*
Table for tracking events related to a particular
account which help us optimize for growth.
Example entry;
 account_id: 'some uuid'
 time: a timestamp
 key: 'sign_up_how_find_cocalc'
 value: 'via a google search'

Or if user got to cocalc via a chat mention link:

 account_id: 'some uuid'
 time: a timestamp
 key: 'mention'
 value: 'url of a chat file'

The user cannot read or write directly to this table.
Writes are done via an API call, which (in theory can)
enforces some limit (to avoid abuse) at some point...
*/
Table({
  name: "user_tracking",
  rules: {
    primary_key: ["account_id", "time"],
    pg_indexes: ["event", "time"],
    durability: "soft",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          account_id: null,
          time: null,
          event: null,
          value: null,
        },
      },
    },
  },
  fields: {
    account_id: {
      type: "uuid",
      desc: "id of the user's account",
    },
    time: {
      type: "timestamp",
      desc: "time of this message",
    },
    event: {
      type: "string",
      desc: "event we are tracking",
      pg_check: "NOT NULL",
    },
    value: {
      type: "map",
      desc: "optional further info about the event (as a map)",
    },
    expire: {
      type: "timestamp",
      desc: "future date, when the entry will be deleted",
    },
  },
});
