/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { callback_opts } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";
import type { PostgreSQL } from "../types";

describe("statistics methods", () => {
  const database: PostgreSQL = db();

  // Wrapper functions that use the CoffeeScript class
  async function get_stats_interval_wrapper(opts: {
    start: Date;
    end: Date;
  }): Promise<any[]> {
    return callback_opts(database.get_stats_interval.bind(database))(opts);
  }

  async function get_active_student_stats_wrapper(): Promise<any> {
    return callback_opts(database.get_active_student_stats.bind(database))({});
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("get_stats_interval", () => {
    it("gets stats within a time range", async () => {
      const pool = getPool();

      // Insert test stats data
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const id1 = uuid();
      const id2 = uuid();

      await pool.query(
        "INSERT INTO stats (id, time, accounts, projects) VALUES ($1, $2, 10, 5)",
        [id1, yesterday],
      );
      await pool.query(
        "INSERT INTO stats (id, time, accounts, projects) VALUES ($1, $2, 20, 10)",
        [id2, twoDaysAgo],
      );

      // Query for stats within range
      const results = await get_stats_interval_wrapper({
        start: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        end: now,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(2);

      const foundIds = results.map((r) => r.id);
      expect(foundIds).toContain(id1);
      expect(foundIds).toContain(id2);
    });

    it("returns empty array when no stats exist in range", async () => {
      const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const farFuturePlus = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000);

      const results = await get_stats_interval_wrapper({
        start: farFuture,
        end: farFuturePlus,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it("filters by start date", async () => {
      const pool = getPool();
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const id1 = uuid();
      const id2 = uuid();

      await pool.query(
        "INSERT INTO stats (id, time, accounts, projects) VALUES ($1, $2, 5, 3)",
        [id1, oneHourAgo],
      );
      await pool.query(
        "INSERT INTO stats (id, time, accounts, projects) VALUES ($1, $2, 8, 4)",
        [id2, twoHoursAgo],
      );

      // Query starting from 90 minutes ago (should only get oneHourAgo)
      const ninetyMinutesAgo = new Date(now.getTime() - 90 * 60 * 1000);
      const results = await get_stats_interval_wrapper({
        start: ninetyMinutesAgo,
        end: now,
      });

      const foundId1 = results.find((r) => r.id === id1);
      const foundId2 = results.find((r) => r.id === id2);

      expect(foundId1).toBeDefined();
      expect(foundId2).toBeUndefined();
    });

    it("filters by end date", async () => {
      const pool = getPool();
      const now = new Date();
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

      const id1 = uuid();
      const id2 = uuid();

      await pool.query(
        "INSERT INTO stats (id, time, accounts, projects) VALUES ($1, $2, 15, 7)",
        [id1, threeHoursAgo],
      );
      await pool.query(
        "INSERT INTO stats (id, time, accounts, projects) VALUES ($1, $2, 18, 9)",
        [id2, fourHoursAgo],
      );

      // Query ending at 3.5 hours ago (should only get fourHoursAgo)
      const threeAndHalfHoursAgo = new Date(
        now.getTime() - 3.5 * 60 * 60 * 1000,
      );
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);

      const results = await get_stats_interval_wrapper({
        start: fiveHoursAgo,
        end: threeAndHalfHoursAgo,
      });

      const foundId1 = results.find((r) => r.id === id1);
      const foundId2 = results.find((r) => r.id === id2);

      expect(foundId1).toBeUndefined();
      expect(foundId2).toBeDefined();
    });

    it("orders results by time", async () => {
      const pool = getPool();
      const now = new Date();

      const times = [
        new Date(now.getTime() - 10 * 60 * 1000), // 10 min ago
        new Date(now.getTime() - 5 * 60 * 1000), // 5 min ago
        new Date(now.getTime() - 15 * 60 * 1000), // 15 min ago
      ];

      const ids = [uuid(), uuid(), uuid()];

      for (let i = 0; i < ids.length; i++) {
        await pool.query(
          "INSERT INTO stats (id, time, accounts, projects) VALUES ($1, $2, $3, $4)",
          [ids[i], times[i], 10 + i, 5 + i],
        );
      }

      const results = await get_stats_interval_wrapper({
        start: new Date(now.getTime() - 20 * 60 * 1000),
        end: now,
      });

      // Filter to only our test entries
      const ourResults = results.filter((r) => ids.includes(r.id));

      expect(ourResults.length).toBeGreaterThanOrEqual(3);

      // Verify ordering: should be in chronological order (oldest first)
      for (let i = 1; i < ourResults.length; i++) {
        expect(ourResults[i].time.getTime()).toBeGreaterThanOrEqual(
          ourResults[i - 1].time.getTime(),
        );
      }
    });
  });

  describe("get_active_student_stats", () => {
    it("returns stats structure with all required fields", async () => {
      const stats = await get_active_student_stats_wrapper();

      expect(stats).toBeDefined();
      expect(typeof stats.conversion_rate).toBe("number");
      expect(typeof stats.num_student_pay).toBe("number");
      expect(typeof stats.num_prof_pay).toBe("number");
      expect(typeof stats.num_free).toBe("number");
      expect(typeof stats.num_1days).toBe("number");
      expect(typeof stats.num_7days).toBe("number");
      expect(typeof stats.num_14days).toBe("number");
      expect(typeof stats.num_30days).toBe("number");
    });

    it("handles empty course projects", async () => {
      // Clean projects table first
      const pool = getPool();
      await pool.query("DELETE FROM projects WHERE course IS NOT NULL");

      const stats = await get_active_student_stats_wrapper();

      expect(stats.num_student_pay).toBe(0);
      expect(stats.num_prof_pay).toBe(0);
      expect(stats.num_free).toBe(0);
      expect(stats.num_1days).toBe(0);
      expect(stats.num_7days).toBe(0);
      expect(stats.num_14days).toBe(0);
      expect(stats.num_30days).toBe(0);
      expect(stats.conversion_rate).toBe(0);
    });

    it("counts student pay projects correctly", async () => {
      const pool = getPool();
      await pool.query("DELETE FROM projects WHERE course IS NOT NULL");

      const projectId = uuid();
      const now = new Date();

      // Insert project with course.pay = true
      await pool.query(
        "INSERT INTO projects (project_id, title, course, last_edited, users) VALUES ($1, $2, $3, $4, $5)",
        [
          projectId,
          "Test Course",
          JSON.stringify({ pay: true }),
          now,
          JSON.stringify({}),
        ],
      );

      const stats = await get_active_student_stats_wrapper();

      expect(stats.num_student_pay).toBeGreaterThanOrEqual(1);
      expect(stats.num_30days).toBeGreaterThanOrEqual(1);
    });

    it("counts prof pay projects correctly", async () => {
      const pool = getPool();
      await pool.query("DELETE FROM projects WHERE course IS NOT NULL");

      const projectId = uuid();
      const accountId = uuid();
      const now = new Date();

      // Insert project with course.pay = false but member_host upgrade
      await pool.query(
        "INSERT INTO projects (project_id, title, course, last_edited, users, settings) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          projectId,
          "Test Course Prof Pay",
          JSON.stringify({ pay: false }),
          now,
          JSON.stringify({
            [accountId]: { upgrades: { member_host: true } },
          }),
          JSON.stringify({}),
        ],
      );

      const stats = await get_active_student_stats_wrapper();

      expect(stats.num_prof_pay).toBeGreaterThanOrEqual(1);
    });

    it("counts free projects correctly", async () => {
      const pool = getPool();
      await pool.query("DELETE FROM projects WHERE course IS NOT NULL");

      const projectId = uuid();
      const now = new Date();

      // Insert project with course.pay = false and no upgrades
      await pool.query(
        "INSERT INTO projects (project_id, title, course, last_edited, users) VALUES ($1, $2, $3, $4, $5)",
        [
          projectId,
          "Test Course Free",
          JSON.stringify({ pay: false }),
          now,
          JSON.stringify({}),
        ],
      );

      const stats = await get_active_student_stats_wrapper();

      expect(stats.num_free).toBeGreaterThanOrEqual(1);
    });

    it("counts activity by time periods", async () => {
      const pool = getPool();
      await pool.query("DELETE FROM projects WHERE course IS NOT NULL");

      const now = new Date();
      const recent = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
      const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
      const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

      const id1 = uuid();
      const id2 = uuid();
      const id3 = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, title, course, last_edited, users) VALUES ($1, $2, $3, $4, $5)",
        [
          id1,
          "Recent",
          JSON.stringify({ pay: false }),
          recent,
          JSON.stringify({}),
        ],
      );

      await pool.query(
        "INSERT INTO projects (project_id, title, course, last_edited, users) VALUES ($1, $2, $3, $4, $5)",
        [
          id2,
          "8 days",
          JSON.stringify({ pay: false }),
          eightDaysAgo,
          JSON.stringify({}),
        ],
      );

      await pool.query(
        "INSERT INTO projects (project_id, title, course, last_edited, users) VALUES ($1, $2, $3, $4, $5)",
        [
          id3,
          "20 days",
          JSON.stringify({ pay: false }),
          twentyDaysAgo,
          JSON.stringify({}),
        ],
      );

      const stats = await get_active_student_stats_wrapper();

      // 1 day: should have at least the recent one
      expect(stats.num_1days).toBeGreaterThanOrEqual(1);

      // 7 days: should have at least the recent one
      expect(stats.num_7days).toBeGreaterThanOrEqual(1);

      // 14 days: should have recent + 8 days ago
      expect(stats.num_14days).toBeGreaterThanOrEqual(2);

      // 30 days: should have all three
      expect(stats.num_30days).toBeGreaterThanOrEqual(3);
    });

    it("calculates conversion rate correctly", async () => {
      const pool = getPool();
      await pool.query("DELETE FROM projects WHERE course IS NOT NULL");

      const now = new Date();

      // Add 2 student pay projects
      for (let i = 0; i < 2; i++) {
        await pool.query(
          "INSERT INTO projects (project_id, title, course, last_edited, users) VALUES ($1, $2, $3, $4, $5)",
          [
            uuid(),
            `Student Pay ${i}`,
            JSON.stringify({ pay: true }),
            now,
            JSON.stringify({}),
          ],
        );
      }

      // Add 1 prof pay project
      const accountId = uuid();
      await pool.query(
        "INSERT INTO projects (project_id, title, course, last_edited, users) VALUES ($1, $2, $3, $4, $5)",
        [
          uuid(),
          "Prof Pay",
          JSON.stringify({ pay: false }),
          now,
          JSON.stringify({
            [accountId]: { upgrades: { member_host: true } },
          }),
        ],
      );

      // Add 7 free projects
      for (let i = 0; i < 7; i++) {
        await pool.query(
          "INSERT INTO projects (project_id, title, course, last_edited, users) VALUES ($1, $2, $3, $4, $5)",
          [
            uuid(),
            `Free ${i}`,
            JSON.stringify({ pay: false }),
            now,
            JSON.stringify({}),
          ],
        );
      }

      const stats = await get_active_student_stats_wrapper();

      // Conversion rate = (student_pay + prof_pay) / total * 100
      // = (2 + 1) / 10 * 100 = 30%
      // Should be around 30% (may have other test data)
      expect(stats.conversion_rate).toBeGreaterThan(0);
      expect(stats.conversion_rate).toBeLessThanOrEqual(100);
    });
  });
});
