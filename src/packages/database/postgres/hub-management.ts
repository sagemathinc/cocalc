/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { callback2 } from "@cocalc/util/async-utils";
import { expire_time } from "@cocalc/util/misc";
import type { PostgreSQL } from "./types";

export interface RegisterHubOptions {
  host: string;
  port: number;
  clients: number;
  ttl: number;
}

export interface HubServer {
  host: string;
  port: number;
  clients: number;
  expire?: Date;
}

/**
 * Register a hub server in the hub_servers table with TTL.
 *
 * Since multiple hubs can run on the same host (but with different ports) and
 * the host is the primary key, we combine the host and port number in the host
 * name for the database.
 *
 * The hub_servers table is only used for tracking connection stats.
 */
export async function register_hub(
  db: PostgreSQL,
  opts: RegisterHubOptions,
): Promise<void> {
  // Combine host and port as unique identifier since multiple hubs can run on same host
  const hostKey = `${opts.host}-${opts.port}`;

  await callback2(db._query.bind(db), {
    query: "INSERT INTO hub_servers",
    values: {
      "host    :: TEXT     ": hostKey,
      "port    :: INTEGER  ": opts.port,
      "clients :: INTEGER  ": opts.clients,
      "expire  :: TIMESTAMP": expire_time(opts.ttl),
    },
    conflict: "host",
  });
}

/**
 * Get all active hub servers from the hub_servers table.
 *
 * This function:
 * 1. Retrieves all hub servers
 * 2. Filters out expired servers
 * 3. Deletes expired servers from the database
 * 4. Returns only active (non-expired) servers
 */
export async function get_hub_servers(db: PostgreSQL): Promise<HubServer[]> {
  // Get all hub servers
  const { rows } = await callback2(db._query.bind(db), {
    query: "SELECT * FROM hub_servers",
  });

  const activeServers: HubServer[] = [];
  const expiredHosts: string[] = [];
  const now = new Date();

  // Separate active and expired servers
  for (const server of rows) {
    if (server.expire && server.expire <= now) {
      expiredHosts.push(server.host);
    } else {
      activeServers.push(server);
    }
  }

  // Delete expired servers if any
  if (expiredHosts.length > 0) {
    await callback2(db._query.bind(db), {
      query: "DELETE FROM hub_servers",
      where: {
        "host = ANY($)": expiredHosts,
      },
    });
  }

  return activeServers;
}
