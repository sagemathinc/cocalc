/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "self_host_connectors",
  rules: {
    primary_key: "connector_id",
    pg_indexes: ["account_id", "host_id", "created", "last_seen"],
  },
  fields: {
    connector_id: {
      type: "uuid",
      desc: "Connector id (public id; also used in token format).",
    },
    account_id: {
      type: "uuid",
      desc: "Owner account for this connector.",
    },
    host_id: {
      type: "uuid",
      desc: "Project host id this connector is attached to (if any).",
    },
    token_hash: {
      type: "string",
      desc: "Hash of the connector token secret.",
    },
    name: {
      type: "string",
      pg_type: "varchar(128)",
      desc: "Optional user-friendly name for the connector.",
    },
    metadata: {
      type: "map",
      desc: "Connector metadata (version, os, arch, capabilities).",
    },
    created: {
      type: "timestamp",
      desc: "When this connector was created.",
    },
    last_seen: {
      type: "timestamp",
      desc: "Last time the connector contacted the hub.",
    },
    revoked: {
      type: "boolean",
      desc: "True if this connector has been revoked.",
    },
  },
});
