/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "project_hosts",
  rules: {
    primary_key: "id",
    pg_indexes: ["region", "status", "last_seen", "deleted"],
  },
  fields: {
    id: {
      type: "uuid",
      desc: "Unique id for this project-host.",
    },
    name: {
      type: "string",
      desc: "Human friendly label for this host.",
    },
    region: {
      type: "string",
      desc: "Location/zone identifier for placement decisions.",
    },
    public_url: {
      type: "string",
      desc: "External URL (or hostname:port) for users to reach this host directly.",
    },
    internal_url: {
      type: "string",
      desc: "Internal URL used by the master or proxy when routing to this host.",
    },
    ssh_server: {
      type: "string",
      desc: "Host:port where SSH is reachable for this host (may differ from HTTP endpoint).",
    },
    status: {
      type: "string",
      desc: "Reported status of the host (e.g., active, draining, offline).",
    },
    last_seen: {
      type: "timestamp",
      desc: "Timestamp of last successful heartbeat from this host.",
    },
    version: {
      type: "string",
      desc: "Software version reported by the host.",
    },
    capacity: {
      type: "map",
      desc: "Capacity/usage summary reported by the host (cpu, mem, disk, project counts, etc.).",
    },
    metadata: {
      type: "map",
      desc: "Additional metadata/config for this host.",
    },
    tier: {
      type: "number",
      desc: "Access tier for shared/pool hosts; empty means only owner/collabs can place projects.",
    },
    created: {
      type: "timestamp",
      desc: "When this host record was created.",
    },
    updated: {
      type: "timestamp",
      desc: "When this host record was last updated.",
    },
    deleted: {
      type: "timestamp",
      desc: "When this host was soft-deleted.",
    },
  },
});
