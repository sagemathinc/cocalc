/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ID } from "./crm";
import { Table } from "./types";

Table({
  name: "news",
  fields: {
    id: ID,
    date: {
      type: "timestamp",
      desc: "date of this news item",
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
      desc: 'e.g. "announcement", "feature", …', // defined in @cocalc/util/types/news → CHANNELS
    },
    hide: {
      type: "boolean",
      desc: "optionally, hide/retract this news item",
    },
    history: {
      type: "map",
      desc: "history of changes to this news item",
    },
  },
  rules: {
    primary_key: "id",
    pg_indexes: ["date"],

    anonymous: true, // allow users read access, even if not signed in
    user_query: {
      get: {
        pg_where: ["date >= NOW() - INTERVAL '3 month'", "hide IS NOT TRUE"],
        options: [{ order_by: "-date" }],
        pg_changefeed: "one-hour",
        throttle_changes: 60000,
        fields: {
          id: null,
          date: null,
          text: null,
          title: null,
          url: null,
          channel: null,
        },
      },
      // set via v2 API
    },
  },
});
