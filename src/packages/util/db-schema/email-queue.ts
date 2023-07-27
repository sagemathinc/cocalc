/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ID } from "./crm";
import { Table } from "./types";

// This keeps track of all email notifications. By creating an entry, they're scheduled to be sent. Once sent, the
// "sent" field is set.  The "expire" field is used to delete old entries.

Table({
  name: "email_queue",
  fields: {
    id: ID,
    created: {
      type: "timestamp",
      desc: "When this was created",
    },
    sent: {
      type: "timestamp",
      desc: "When this was sent",
    },
    config: {
      type: "map",
      desc: "the configuration for the email, i.e. a set of template variables",
    },
    template: {
      type: "string",
      desc: "each type of email has its own unique name",
    },
    priority: {
      type: "integer",
      desc: "higher priority emails are sent first",
    },
    expire: {
      type: "timestamp",
      desc: "when to expire this",
    },
  },
  rules: {
    primary_key: "id",
    pg_indexes: ["date", "priority", "sent IS NOT NULL"],
    // no user queries, all handled by the server
  },
});
