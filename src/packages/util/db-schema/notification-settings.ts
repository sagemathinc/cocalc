/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

// This keeps track of all email notifications. By creating an entry, they're scheduled to be sent. Once sent, the
// "sent" field is set.  The "expire" field is used to delete old entries.

Table({
  name: "notification_settings",
  fields: {
    account_id: {
      type: "uuid",
      desc: "The account id of the user wants to control the notifications for.",
    },
    settings: {
      type: "map",
      desc: "A mapping of each type of email (channel) to a setting. Initially just true|false, but it could be more complex.",
    },
  },
  rules: {
    desc: "Notification settings",
    primary_key: "account_id",
    user_query: {
      get: {
        pg_where: [{ "account_id = $::UUID": "account_id" }],
        fields: {
          settings: null,
        },
      },
      set: {
        fields: {
          settings: true,
        },
      },
    },
  },
});
