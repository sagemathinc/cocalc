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

describe("recent project queries", () => {
  const database: PostgreSQL = db();

  const recentlyModifiedProjectsLegacy = callback_opts(
    database.recently_modified_projects.bind(database),
  ) as (opts: { max_age_s: number }) => Promise<string[]>;
  const getOpenUnusedProjectsLegacy = callback_opts(
    database.get_open_unused_projects.bind(database),
  ) as (opts: {
    min_age_days?: number;
    max_age_days?: number;
    host: string;
  }) => Promise<string[]>;
  const recentProjectsLegacy = callback_opts(
    database.recent_projects.bind(database),
  ) as (opts: {
    age_m: number;
    min_age_m?: number;
    pluck?: string[];
  }) => Promise<any>;

  async function recentlyModifiedProjects(opts: {
    max_age_s: number;
  }): Promise<string[]> {
    return recentlyModifiedProjectsLegacy(opts);
  }

  async function getOpenUnusedProjects(opts: {
    min_age_days?: number;
    max_age_days?: number;
    host: string;
  }): Promise<string[]> {
    return getOpenUnusedProjectsLegacy(opts);
  }

  async function recentProjects(opts: {
    age_m: number;
    min_age_m?: number;
    pluck?: string[];
  }): Promise<any> {
    return recentProjectsLegacy(opts);
  }

  async function insertProject(opts: {
    project_id: string;
    last_edited: Date;
    host?: string;
    state?: string;
  }): Promise<void> {
    const pool = getPool();
    const hostValue =
      opts.host == null ? null : JSON.stringify({ host: opts.host });
    const stateValue =
      opts.state == null ? null : JSON.stringify({ state: opts.state });
    await pool.query(
      "INSERT INTO projects (project_id, title, users, last_edited, host, state) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        opts.project_id,
        "Test Project",
        JSON.stringify({}),
        opts.last_edited,
        hostValue,
        stateValue,
      ],
    );
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterEach(async () => {
    const pool = getPool();
    await pool.query("DELETE FROM projects");
  });

  afterAll(async () => {
    await testCleanup();
  });

  it("recently_modified_projects returns recent project ids", async () => {
    const now = Date.now();
    const recentId = uuid();
    const oldId = uuid();
    await insertProject({
      project_id: recentId,
      last_edited: new Date(now - 30 * 60 * 1000),
    });
    await insertProject({
      project_id: oldId,
      last_edited: new Date(now - 2 * 60 * 60 * 1000),
    });

    const results = await recentlyModifiedProjects({ max_age_s: 3600 });
    const resultSet = new Set(results);

    expect(resultSet.has(recentId)).toBe(true);
    expect(resultSet.has(oldId)).toBe(false);
  });

  it("recently_modified_projects returns empty when no projects are recent", async () => {
    const now = Date.now();
    await insertProject({
      project_id: uuid(),
      last_edited: new Date(now - 2 * 60 * 60 * 1000),
    });

    const results = await recentlyModifiedProjects({ max_age_s: 60 });
    expect(results).toEqual([]);
  });

  it("get_open_unused_projects returns projects in the expected window", async () => {
    const now = Date.now();
    const host = "test-host";
    const inWindowId = uuid();
    const tooRecentId = uuid();
    const tooOldId = uuid();
    const wrongHostId = uuid();
    const wrongStateId = uuid();

    await insertProject({
      project_id: inWindowId,
      last_edited: new Date(now - 60 * 24 * 60 * 60 * 1000),
      host,
      state: "opened",
    });
    await insertProject({
      project_id: tooRecentId,
      last_edited: new Date(now - 10 * 24 * 60 * 60 * 1000),
      host,
      state: "opened",
    });
    await insertProject({
      project_id: tooOldId,
      last_edited: new Date(now - 200 * 24 * 60 * 60 * 1000),
      host,
      state: "opened",
    });
    await insertProject({
      project_id: wrongHostId,
      last_edited: new Date(now - 60 * 24 * 60 * 60 * 1000),
      host: "other-host",
      state: "opened",
    });
    await insertProject({
      project_id: wrongStateId,
      last_edited: new Date(now - 60 * 24 * 60 * 60 * 1000),
      host,
      state: "running",
    });

    const results = await getOpenUnusedProjects({
      min_age_days: 30,
      max_age_days: 120,
      host,
    });
    const resultSet = new Set(results);

    expect(resultSet.has(inWindowId)).toBe(true);
    expect(resultSet.has(tooRecentId)).toBe(false);
    expect(resultSet.has(tooOldId)).toBe(false);
    expect(resultSet.has(wrongHostId)).toBe(false);
    expect(resultSet.has(wrongStateId)).toBe(false);
    expect(resultSet.size).toBe(1);
  });

  describe("recent_projects", () => {
    it("returns project ids within age window", async () => {
      const now = Date.now();
      const recentId = uuid();
      const oldId = uuid();
      const tooOldId = uuid();

      await insertProject({
        project_id: recentId,
        last_edited: new Date(now - 30 * 60 * 1000), // 30 minutes ago
      });
      await insertProject({
        project_id: oldId,
        last_edited: new Date(now - 90 * 60 * 1000), // 90 minutes ago
      });
      await insertProject({
        project_id: tooOldId,
        last_edited: new Date(now - 3 * 60 * 60 * 1000), // 3 hours ago
      });

      const results = await recentProjects({
        age_m: 120, // last 2 hours
      });

      const resultSet = new Set(results);
      expect(resultSet.has(recentId)).toBe(true);
      expect(resultSet.has(oldId)).toBe(true);
      expect(resultSet.has(tooOldId)).toBe(false);
    });

    it("respects min_age_m parameter", async () => {
      const now = Date.now();
      const veryRecentId = uuid();
      const recentId = uuid();
      const oldId = uuid();

      await insertProject({
        project_id: veryRecentId,
        last_edited: new Date(now - 5 * 60 * 1000), // 5 minutes ago
      });
      await insertProject({
        project_id: recentId,
        last_edited: new Date(now - 30 * 60 * 1000), // 30 minutes ago
      });
      await insertProject({
        project_id: oldId,
        last_edited: new Date(now - 90 * 60 * 1000), // 90 minutes ago
      });

      const results = await recentProjects({
        age_m: 120, // last 2 hours
        min_age_m: 15, // but at least 15 minutes old
      });

      const resultSet = new Set(results);
      expect(resultSet.has(veryRecentId)).toBe(false); // too recent
      expect(resultSet.has(recentId)).toBe(true);
      expect(resultSet.has(oldId)).toBe(true);
    });

    it("returns multiple columns when pluck is specified", async () => {
      const now = Date.now();
      const projectId = uuid();

      await insertProject({
        project_id: projectId,
        last_edited: new Date(now - 30 * 60 * 1000),
      });

      const results = await recentProjects({
        age_m: 60,
        pluck: ["project_id", "title", "last_edited"],
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        project_id: projectId,
        title: "Test Project",
      });
      expect(results[0].last_edited).toBeDefined();
    });

    it("returns empty array when no projects in range", async () => {
      const now = Date.now();

      await insertProject({
        project_id: uuid(),
        last_edited: new Date(now - 3 * 60 * 60 * 1000), // 3 hours ago
      });

      const results = await recentProjects({
        age_m: 60, // last hour
      });

      expect(results).toEqual([]);
    });

    it("handles pluck with single column", async () => {
      const now = Date.now();
      const projectId = uuid();

      await insertProject({
        project_id: projectId,
        last_edited: new Date(now - 30 * 60 * 1000),
      });

      const results = await recentProjects({
        age_m: 60,
        pluck: ["title"],
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        title: "Test Project",
      });
    });
  });
});
