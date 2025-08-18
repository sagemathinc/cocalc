/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
    tags: {
      type: "array",
      pg_type: "TEXT[]",
      desc: "list of strings, e.g. ['jupyter', 'python']",
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
    until: {
      type: "timestamp",
      desc: "optional expiration date - news item will not be shown after this date",
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
        pg_where: [
          "date >= NOW() - INTERVAL '3 months'",
          "date <= NOW() + INTERVAL '1 minute'",
          "channel != 'event'",
          "hide IS NOT true",
          "(until IS NULL OR until > NOW())",
        ],
        pg_changefeed: "news",
        options: [{ order_by: "-date" }, { limit: 100 }],
        throttle_changes: 60 * 1000,
        fields: {
          // we only send title, and a link to open the news item
          id: null,
          date: null,
          title: null,
          tags: null,
          channel: null,
          hide: null,
        },
      },
      // no set, all done via v2 API
    },
  },
});
