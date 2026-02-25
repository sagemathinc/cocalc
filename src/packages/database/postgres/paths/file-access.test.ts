/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { uuid } from "@cocalc/util/misc";

import {
  get_file_access,
  get_file_use,
  log_file_access,
  record_file_use,
} from "./file-access";
import type { PostgreSQL } from "../types";

describe("file access methods", () => {
  const database: PostgreSQL = db();

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("log_file_access and get_file_access", () => {
    it("logs file access and retrieves it", async () => {
      const project_id = uuid();
      const account_id = uuid();
      const filename = `test_file_${Date.now()}.txt`;

      await log_file_access(database, {
        project_id,
        account_id,
        filename,
      });

      const results = await get_file_access(database, {
        project_id,
        account_id,
        filename,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const foundEntry = results.find(
        (r) =>
          r.project_id === project_id &&
          r.account_id === account_id &&
          r.filename === filename,
      );
      expect(foundEntry).toBeDefined();
      expect(foundEntry!.time).toBeInstanceOf(Date);
    });

    it("filters by project_id", async () => {
      const project_id = uuid();
      const account_id = uuid();
      const filename = `test_filter_project_${Date.now()}.txt`;

      await log_file_access(database, {
        project_id,
        account_id,
        filename,
      });

      const results = await get_file_access(database, { project_id });

      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach((entry) => {
        expect(entry.project_id).toBe(project_id);
      });
    });

    it("filters by account_id", async () => {
      const project_id = uuid();
      const account_id = uuid();
      const filename = `test_filter_account_${Date.now()}.txt`;

      await log_file_access(database, {
        project_id,
        account_id,
        filename,
      });

      const results = await get_file_access(database, { account_id });

      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach((entry) => {
        expect(entry.account_id).toBe(account_id);
      });
    });

    it("filters by time range", async () => {
      const project_id = uuid();
      const account_id = uuid();
      const filename = `test_time_range_${Date.now()}.txt`;

      const start = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const end = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now

      await log_file_access(database, {
        project_id,
        account_id,
        filename,
      });

      const results = await get_file_access(database, {
        start,
        end,
        filename,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach((entry) => {
        expect(entry.time.getTime()).toBeGreaterThanOrEqual(start.getTime());
        expect(entry.time.getTime()).toBeLessThanOrEqual(end.getTime());
      });
    });

    it("throttles duplicate log_file_access calls", async () => {
      const project_id = uuid();
      const account_id = uuid();
      const filename = `test_throttle_${Date.now()}.txt`;

      // First call should succeed
      await log_file_access(database, {
        project_id,
        account_id,
        filename,
      });

      const before = await get_file_access(database, {
        project_id,
        account_id,
        filename,
      });
      const countBefore = before.length;

      // Second call within 60s should be throttled
      await log_file_access(database, {
        project_id,
        account_id,
        filename,
      });

      const after = await get_file_access(database, {
        project_id,
        account_id,
        filename,
      });

      // Count should be the same (second call was throttled)
      expect(after.length).toBe(countBefore);
    });

    it("returns empty array when no matches found", async () => {
      const nonexistent_project = uuid();

      const results = await get_file_access(database, {
        project_id: nonexistent_project,
      });

      expect(results).toEqual([]);
    });
  });

  describe("record_file_use and get_file_use", () => {
    it("records file use with edit action", async () => {
      const project_id = uuid();
      const account_id = uuid();
      const path = `test_path_${Date.now()}.txt`;

      await record_file_use(database, {
        project_id,
        path,
        account_id,
        action: "edit",
      });

      const result = await get_file_use(database, {
        project_id,
        path,
      });

      expect(result).toBeDefined();
      expect((result as any).project_id).toBe(project_id);
      expect((result as any).path).toBe(path);
      expect((result as any).last_edited).toBeInstanceOf(Date);
      expect((result as any).users).toBeDefined();
      expect((result as any).users[account_id]).toBeDefined();
      // JSONB fields store dates as strings
      expect(typeof (result as any).users[account_id].edit).toBe("string");
    });

    it("records file use with read action", async () => {
      const project_id = uuid();
      const account_id = uuid();
      const path = `test_read_${Date.now()}.txt`;

      await record_file_use(database, {
        project_id,
        path,
        account_id,
        action: "read",
      });

      const result = await get_file_use(database, {
        project_id,
        path,
      });

      expect(result).toBeDefined();
      expect((result as any).users[account_id]).toBeDefined();
      // JSONB fields store dates as strings
      expect(typeof (result as any).users[account_id].read).toBe("string");
    });

    it("records file use with chat action", async () => {
      const project_id = uuid();
      const account_id = uuid();
      const path = `test_chat_${Date.now()}.txt`;

      await record_file_use(database, {
        project_id,
        path,
        account_id,
        action: "chat",
      });

      const result = await get_file_use(database, {
        project_id,
        path,
      });

      expect(result).toBeDefined();
      expect((result as any).last_edited).toBeInstanceOf(Date);
      expect((result as any).users[account_id]).toBeDefined();
      // JSONB fields store dates as strings
      expect(typeof (result as any).users[account_id].chat).toBe("string");
    });

    it("tracks multiple actions from same user", async () => {
      const project_id = uuid();
      const account_id = uuid();
      const path = `test_multiple_${Date.now()}.txt`;

      await record_file_use(database, {
        project_id,
        path,
        account_id,
        action: "edit",
      });

      await record_file_use(database, {
        project_id,
        path,
        account_id,
        action: "read",
      });

      const result = await get_file_use(database, {
        project_id,
        path,
      });

      expect(result).toBeDefined();
      // JSONB fields store dates as strings
      expect(typeof (result as any).users[account_id].edit).toBe("string");
      expect(typeof (result as any).users[account_id].read).toBe("string");
    });

    it("tracks actions from multiple users", async () => {
      const project_id = uuid();
      const account_id1 = uuid();
      const account_id2 = uuid();
      const path = `test_multi_user_${Date.now()}.txt`;

      await record_file_use(database, {
        project_id,
        path,
        account_id: account_id1,
        action: "edit",
      });

      await record_file_use(database, {
        project_id,
        path,
        account_id: account_id2,
        action: "read",
      });

      const result = await get_file_use(database, {
        project_id,
        path,
      });

      expect(result).toBeDefined();
      expect((result as any).users[account_id1]).toBeDefined();
      expect((result as any).users[account_id2]).toBeDefined();
    });

    it("gets file use by project_ids array", async () => {
      const project_id1 = uuid();
      const project_id2 = uuid();
      const account_id = uuid();
      const path1 = `test_array1_${Date.now()}.txt`;
      const path2 = `test_array2_${Date.now()}.txt`;

      await record_file_use(database, {
        project_id: project_id1,
        path: path1,
        account_id,
        action: "edit",
      });

      await record_file_use(database, {
        project_id: project_id2,
        path: path2,
        account_id,
        action: "edit",
      });

      const results = await get_file_use(database, {
        project_ids: [project_id1, project_id2],
      });

      expect(Array.isArray(results)).toBe(true);
      expect((results as any[]).length).toBeGreaterThanOrEqual(2);
    });

    it("filters by max_age_s", async () => {
      const project_id = uuid();
      const account_id = uuid();
      const path = `test_max_age_${Date.now()}.txt`;

      await record_file_use(database, {
        project_id,
        path,
        account_id,
        action: "edit",
      });

      // Query with max_age_s of 1 hour (3600s)
      const results = await get_file_use(database, {
        project_id,
        max_age_s: 3600,
      });

      // Should include our recently created entry
      expect(Array.isArray(results)).toBe(true);
      const found = (results as any[]).find((r) => r.path === path);
      expect(found).toBeDefined();
    });

    it("throws error when both project_id and project_ids specified", async () => {
      const project_id = uuid();

      await expect(
        get_file_use(database, {
          project_id,
          project_ids: [uuid()],
        }),
      ).rejects.toThrow("don't specify both project_id and project_ids");
    });

    it("throws error when neither project_id nor project_ids specified", async () => {
      await expect(
        get_file_use(database, {
          path: "some_path.txt",
        }),
      ).rejects.toThrow("project_id or project_ids must be defined");
    });

    it("returns undefined for non-existent file", async () => {
      const project_id = uuid();
      const nonexistent_path = `nonexistent_${Date.now()}.txt`;

      const result = await get_file_use(database, {
        project_id,
        path: nonexistent_path,
      });

      expect(result).toBeUndefined();
    });
  });
});
