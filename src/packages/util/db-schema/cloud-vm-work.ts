/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "cloud_vm_work",
  fields: {
    id: {
      type: "uuid",
      desc: "Unique id for this work item.",
    },
    vm_id: {
      type: "string",
      desc: "Target VM identifier.",
    },
    action: {
      type: "string",
      desc: "Work action (create/start/stop/delete/resize/status).",
    },
    payload: {
      type: "map",
      desc: "Action-specific payload.",
    },
    state: {
      type: "string",
      desc: "Work state (queued/in_progress/done/failed).",
    },
    attempt: {
      type: "number",
      desc: "Attempt counter.",
    },
    locked_by: {
      type: "string",
      desc: "Worker identifier holding the lock.",
    },
    locked_at: {
      type: "timestamp",
      desc: "When this work item was locked.",
    },
    error: {
      type: "string",
      desc: "Failure reason when state=failed.",
    },
    created_at: {
      type: "timestamp",
      desc: "Creation time.",
    },
    updated_at: {
      type: "timestamp",
      desc: "Last update time.",
    },
  },
  rules: {
    primary_key: "id",
    pg_indexes: ["vm_id", "state", "created_at"],
    durability: "soft",
  },
});
