/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "passport_settings",
  rules: {
    primary_key: "strategy",
  },
  fields: {
    strategy: {
      type: "string",
    },
    conf: {
      type: "map",
    },
  },
});

Table({
  name: "server_settings",
  rules: {
    primary_key: "name",
    anonymous: false,
    user_query: {
      // NOTE: can *set* but cannot get!
      set: {
        admin: true,
        fields: {
          name: null,
          value: null,
        },
      },
    },
  },
  fields: {
    name: {
      type: "string",
    },
    value: {
      type: "string",
    },
    readonly: {
      type: "boolean",
      desc: "If true, the user interface should not allow to edit that value – it is controlled externally or via an environment variable.",
    },
  },
});
