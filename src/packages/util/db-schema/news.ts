/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ID } from "./crm";
import { Table } from "./types";

Table({
  name: "news",
  fields: {
    id: ID,
    time: {
      type: "timestamp",
      desc: "time of this message",
    },
    title: {
      type: "string",
      desc: "short title of this news item",
    },
    text: {
      type: "string",
      desc: "markdown text of this news item",
    },
    url: {
      type: "string",
      desc: "optional url",
    },
    channel: {
      type: "string",
      desc: 'e.g. "software", "system", "features", …',
    },
    hide: {
      type: "boolean",
      desc: "optionally, hide/retract this news item",
    },
  },
  rules: {
    primary_key: "id",
    pg_indexes: ["time"],

    anonymous: true, // allow users read access, even if not signed in
    user_query: {
      get: {
        pg_where: ["time >= NOW() - INTERVAL '3 month'", "hide IS NOT TRUE"],
        options: [{ order_by: "-time" }],
        pg_changefeed: "one-hour",
        throttle_changes: 60000,
        fields: {
          id: null,
          time: null,
          text: null,
          title: null,
          channel: null,
        },
      },
      // set via v2 API
    },
  },
});
