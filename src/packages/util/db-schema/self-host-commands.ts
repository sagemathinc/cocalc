/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "self_host_commands",
  rules: {
    primary_key: "command_id",
    pg_indexes: ["connector_id", "state", "created"],
  },
  fields: {
    command_id: {
      type: "uuid",
      desc: "Command id.",
    },
    connector_id: {
      type: "uuid",
      desc: "Connector id this command targets.",
    },
    action: {
      type: "string",
      pg_type: "varchar(64)",
      desc: "Action name (create/start/stop/delete/status).",
    },
    payload: {
      type: "map",
      desc: "Action payload (JSON).",
    },
    state: {
      type: "string",
      pg_type: "varchar(32)",
      desc: "Command state (pending/sent/done/error).",
    },
    result: {
      type: "map",
      desc: "Result payload (JSON).",
    },
    error: {
      type: "string",
      desc: "Error message, if any.",
    },
    created: {
      type: "timestamp",
      desc: "When this command was created.",
    },
    updated: {
      type: "timestamp",
      desc: "When this command was last updated.",
    },
  },
});
