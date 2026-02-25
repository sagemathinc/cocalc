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

describe("project extra env methods", () => {
  const database: PostgreSQL = db();

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("get_project_extra_env", () => {
    it("returns empty object for project with no env", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const result = await callback_opts(
        database.get_project_extra_env.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toEqual({});
    });

    it("returns env when it exists", async () => {
      const pool = getPool();
      const projectId = uuid();
      const env = {
        FOO: "bar",
        PATH: "/custom/path",
        DEBUG: "true",
      };

      await pool.query(
        "INSERT INTO projects (project_id, env) VALUES ($1, $2)",
        [projectId, JSON.stringify(env)],
      );

      const result = await callback_opts(
        database.get_project_extra_env.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toEqual(env);
    });

    it("handles complex env values", async () => {
      const pool = getPool();
      const projectId = uuid();
      const env = {
        SIMPLE: "value",
        WITH_SPACES: "value with spaces",
        WITH_SPECIAL: "value=with=equals",
        EMPTY: "",
        MULTILINE: "line1\nline2\nline3",
      };

      await pool.query(
        "INSERT INTO projects (project_id, env) VALUES ($1, $2)",
        [projectId, JSON.stringify(env)],
      );

      const result = await callback_opts(
        database.get_project_extra_env.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toEqual(env);
    });

    it("returns empty object for null env", async () => {
      const pool = getPool();
      const projectId = uuid();

      // Explicitly set env to null
      await pool.query(
        "INSERT INTO projects (project_id, env) VALUES ($1, NULL)",
        [projectId],
      );

      const result = await callback_opts(
        database.get_project_extra_env.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toEqual({});
    });

    it("handles empty object as env", async () => {
      const pool = getPool();
      const projectId = uuid();

      await pool.query(
        "INSERT INTO projects (project_id, env) VALUES ($1, $2)",
        [projectId, JSON.stringify({})],
      );

      const result = await callback_opts(
        database.get_project_extra_env.bind(database),
      )({
        project_id: projectId,
      });

      expect(result).toEqual({});
    });
  });
});
