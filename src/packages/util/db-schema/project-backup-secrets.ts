/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "project_backup_secrets",
  rules: {
    primary_key: "project_id",
  },
  fields: {
    project_id: {
      type: "uuid",
      desc: "Project id for this backup secret.",
    },
    secret: {
      type: "string",
      desc: "Per-project rustic repository password (store securely).",
    },
    created: {
      type: "timestamp",
      desc: "When this secret was created.",
    },
    updated: {
      type: "timestamp",
      desc: "When this secret was last updated.",
    },
  },
});
