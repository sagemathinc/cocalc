/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { callback_opts } from "@cocalc/util/async-utils";
import type { PostgreSQL } from "./types";

describe("hub management methods", () => {
  const database: PostgreSQL = db();

  // Wrapper functions that use the CoffeeScript class
  async function register_hub_wrapper(opts: {
    host: string;
    port: number;
    clients: number;
    ttl: number;
  }): Promise<void> {
    return callback_opts(database.register_hub.bind(database))(opts);
  }

  async function get_hub_servers_wrapper(): Promise<any[]> {
    return callback_opts(database.get_hub_servers.bind(database))({});
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    db()._close_test_query?.();
    await getPool().end();
  });

  describe("register_hub and get_hub_servers", () => {
    it("registers a new hub server", async () => {
      const host = `test-host-${Date.now()}`;
      const port = 5000;
      const clients = 10;
      const ttl = 3600; // 1 hour

      await register_hub_wrapper({
        host,
        port,
        clients,
        ttl,
      });

      const servers = await get_hub_servers_wrapper();
      const foundServer = servers.find((s) => s.host === `${host}-${port}`);

      expect(foundServer).toBeDefined();
      expect(foundServer?.port).toBe(port);
      expect(foundServer?.clients).toBe(clients);
      expect(foundServer?.expire).toBeInstanceOf(Date);
    });

    it("updates an existing hub server on conflict", async () => {
      const host = `test-update-${Date.now()}`;
      const port = 5001;
      const ttl = 3600;

      // Register first time
      await register_hub_wrapper({
        host,
        port,
        clients: 5,
        ttl,
      });

      // Register again with different client count
      await register_hub_wrapper({
        host,
        port,
        clients: 15,
        ttl,
      });

      const servers = await get_hub_servers_wrapper();
      const foundServer = servers.find((s) => s.host === `${host}-${port}`);

      expect(foundServer).toBeDefined();
      expect(foundServer?.clients).toBe(15); // Should be updated
    });

    it("allows multiple hubs on different ports of same host", async () => {
      const host = `test-multiport-${Date.now()}`;
      const port1 = 5010;
      const port2 = 5011;
      const ttl = 3600;

      await register_hub_wrapper({
        host,
        port: port1,
        clients: 10,
        ttl,
      });

      await register_hub_wrapper({
        host,
        port: port2,
        clients: 20,
        ttl,
      });

      const servers = await get_hub_servers_wrapper();
      const server1 = servers.find((s) => s.host === `${host}-${port1}`);
      const server2 = servers.find((s) => s.host === `${host}-${port2}`);

      expect(server1).toBeDefined();
      expect(server2).toBeDefined();
      expect(server1?.clients).toBe(10);
      expect(server2?.clients).toBe(20);
    });

    it("filters out expired servers", async () => {
      const host = `test-expired-${Date.now()}`;
      const port = 5020;

      // Register with very short TTL (1 second)
      await register_hub_wrapper({
        host,
        port,
        clients: 5,
        ttl: 1,
      });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const servers = await get_hub_servers_wrapper();
      const foundServer = servers.find((s) => s.host === `${host}-${port}`);

      expect(foundServer).toBeUndefined();
    });

    it("deletes expired servers from database", async () => {
      const host = `test-delete-${Date.now()}`;
      const port = 5030;
      const hostKey = `${host}-${port}`;

      // Register with very short TTL
      await register_hub_wrapper({
        host,
        port,
        clients: 5,
        ttl: 1,
      });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Call get_hub_servers which should delete expired servers
      await get_hub_servers_wrapper();

      // Query database directly to verify deletion
      const pool = getPool();
      const { rows } = await pool.query(
        "SELECT * FROM hub_servers WHERE host = $1",
        [hostKey],
      );

      expect(rows.length).toBe(0);
    });

    it("returns empty array when no servers exist", async () => {
      // Clean up all servers first
      const pool = getPool();
      await pool.query("DELETE FROM hub_servers");

      const servers = await get_hub_servers_wrapper();

      expect(Array.isArray(servers)).toBe(true);
      expect(servers.length).toBe(0);
    });

    it("returns only active servers when mix of active and expired", async () => {
      // Clean up first
      const pool = getPool();
      await pool.query("DELETE FROM hub_servers");

      const activeHost = `test-active-${Date.now()}`;
      const expiredHost = `test-exp-${Date.now()}`;
      const port = 5040;

      // Register active server (1 hour TTL)
      await register_hub_wrapper({
        host: activeHost,
        port,
        clients: 10,
        ttl: 3600,
      });

      // Register expired server (1 second TTL)
      await register_hub_wrapper({
        host: expiredHost,
        port,
        clients: 5,
        ttl: 1,
      });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const servers = await get_hub_servers_wrapper();

      expect(servers.length).toBe(1);
      expect(servers[0].host).toBe(`${activeHost}-${port}`);
      expect(servers[0].clients).toBe(10);
    });

    it("correctly sets expiration timestamp based on TTL", async () => {
      const host = `test-ttl-${Date.now()}`;
      const port = 5050;
      const ttl = 7200; // 2 hours
      const beforeRegister = new Date();

      await register_hub_wrapper({
        host,
        port,
        clients: 10,
        ttl,
      });

      const servers = await get_hub_servers_wrapper();
      const foundServer = servers.find((s) => s.host === `${host}-${port}`);

      expect(foundServer).toBeDefined();
      expect(foundServer?.expire).toBeInstanceOf(Date);

      if (foundServer?.expire) {
        const expectedExpire = new Date(beforeRegister.getTime() + ttl * 1000);
        const actualExpire = foundServer.expire;

        // Allow 5 second margin for test execution time
        const diff = Math.abs(
          actualExpire.getTime() - expectedExpire.getTime(),
        );
        expect(diff).toBeLessThan(5000);
      }
    });

    it("handles large number of clients", async () => {
      const host = `test-large-${Date.now()}`;
      const port = 5060;
      const clients = 99999;
      const ttl = 3600;

      await register_hub_wrapper({
        host,
        port,
        clients,
        ttl,
      });

      const servers = await get_hub_servers_wrapper();
      const foundServer = servers.find((s) => s.host === `${host}-${port}`);

      expect(foundServer).toBeDefined();
      expect(foundServer?.clients).toBe(clients);
    });

    it("handles zero clients", async () => {
      const host = `test-zero-${Date.now()}`;
      const port = 5070;
      const clients = 0;
      const ttl = 3600;

      await register_hub_wrapper({
        host,
        port,
        clients,
        ttl,
      });

      const servers = await get_hub_servers_wrapper();
      const foundServer = servers.find((s) => s.host === `${host}-${port}`);

      expect(foundServer).toBeDefined();
      expect(foundServer?.clients).toBe(0);
    });
  });
});
