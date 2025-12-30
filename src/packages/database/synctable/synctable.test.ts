/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Integration tests for SyncTable using a real ephemeral Postgres database.

import { sha1 } from "@cocalc/backend/misc_node";
import { db, pg_type } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { uuid } from "@cocalc/util/misc";
import { SCHEMA } from "@cocalc/util/schema";

import type { SyncTable } from "./synctable";
import type { ChangeEvent, Changes } from "../postgres/changefeed";

const INSERT_SYNCSTRING =
  "INSERT INTO syncstrings(string_id,project_id,path) VALUES($1,$2,$3)";
const INSERT_PATCH =
  "INSERT INTO patches(string_id,time,is_snapshot,user_id,patch) VALUES($1,$2,$3,$4,$5)";

const PATCHES_SELECT = {
  string_id: pg_type(SCHEMA.patches.fields.string_id),
  time: pg_type(SCHEMA.patches.fields.time),
  is_snapshot: pg_type(SCHEMA.patches.fields.is_snapshot),
};

async function createSyncstring(
  stringId: string,
  projectId: string,
  path: string,
) {
  const pool = getPool();
  await pool.query(INSERT_SYNCSTRING, [stringId, projectId, path]);
}

async function deleteSyncstring(stringId: string) {
  const pool = getPool();
  await pool.query("DELETE FROM syncstrings WHERE string_id = $1", [stringId]);
}

async function createPatch(stringId: string, patch: string, time: Date) {
  const pool = getPool();
  await pool.query(INSERT_PATCH, [stringId, time, false, 0, patch]);
}

async function deletePatches(stringId: string) {
  const pool = getPool();
  await pool.query("DELETE FROM patches WHERE string_id = $1", [stringId]);
}

async function createSyncTable(): Promise<SyncTable> {
  return await new Promise((resolve, reject) => {
    const table = db().synctable({
      table: "syncstrings",
      columns: ["path"],
      cb: (err, st) => {
        if (err) {
          reject(err);
          return;
        }
        if (!st) {
          reject(new Error("synctable callback returned no table"));
          return;
        }
        resolve(st);
      },
    });
    if (!table) {
      reject(new Error("synctable did not initialize"));
    }
  });
}

async function createPatchChangefeed(stringId: string): Promise<Changes> {
  return await new Promise((resolve, reject) => {
    const changes = db().changefeed({
      table: "patches",
      select: PATCHES_SELECT,
      watch: ["patch"],
      where: { "string_id = $": stringId },
      cb: (err, feed) => {
        if (err) {
          reject(err);
          return;
        }
        if (!feed) {
          reject(new Error("changefeed callback returned no feed"));
          return;
        }
        resolve(feed);
      },
    });
    if (!changes) {
      reject(new Error("changefeed did not initialize"));
    }
  });
}

async function closeSyncTable(st: SyncTable) {
  await new Promise<void>((resolve) => {
    st.close(() => resolve());
  });
}

function waitForChangefeed(
  changes: Changes,
  timeoutMs = 5000,
): Promise<ChangeEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout waiting for changefeed change"));
    }, timeoutMs);
    changes.once("change", (change) => {
      clearTimeout(timer);
      resolve(change);
    });
  });
}

function waitForChange(st: SyncTable, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout waiting for synctable change"));
    }, timeoutMs);
    st.once("change", (key) => {
      clearTimeout(timer);
      resolve(String(key));
    });
  });
}

describe("SyncTable (integration)", () => {
  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup(db());
  });

  test("loads existing rows into the cache", async () => {
    const projectId = uuid();
    const path = `synctable-test-${uuid()}.txt`;
    const stringId = sha1(`${projectId}${path}`);

    await createSyncstring(stringId, projectId, path);

    const st = await createSyncTable();
    try {
      expect(st.getIn([stringId, "path"])).toBe(path);
    } finally {
      await closeSyncTable(st);
      await deleteSyncstring(stringId);
    }
  });

  test("waits for an insert and exposes it in getIn", async () => {
    const projectId = uuid();
    const path = `synctable-test-${uuid()}.txt`;
    const stringId = sha1(`${projectId}${path}`);

    const st = await createSyncTable();
    try {
      const waitForInsert = new Promise<void>((resolve, reject) => {
        st.wait({
          until: (table) => table.getIn([stringId, "path"]) === path,
          timeout: 5,
          cb: (err) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          },
        });
      });

      await createSyncstring(stringId, projectId, path);
      await waitForInsert;

      expect(st.getIn([stringId, "path"])).toBe(path);
    } finally {
      await closeSyncTable(st);
      await deleteSyncstring(stringId);
    }
  });

  test("emits change on delete and removes the row", async () => {
    const projectId = uuid();
    const path = `synctable-test-${uuid()}.txt`;
    const stringId = sha1(`${projectId}${path}`);

    await createSyncstring(stringId, projectId, path);

    const st = await createSyncTable();
    try {
      const change = waitForChange(st);
      await deleteSyncstring(stringId);

      expect(await change).toBe(stringId);
      expect(st.has(stringId)).toBe(false);
    } finally {
      await closeSyncTable(st);
      await deleteSyncstring(stringId);
    }
  });

  test("changefeed emits patch insert events", async () => {
    const projectId = uuid();
    const path = `synctable-test-${uuid()}.txt`;
    const stringId = sha1(`${projectId}${path}`);
    const patch = `patch-${uuid()}`;
    const time = new Date();

    await createSyncstring(stringId, projectId, path);

    const changes = await createPatchChangefeed(stringId);
    try {
      const changePromise = waitForChangefeed(changes);
      await createPatch(stringId, patch, time);

      const change = await changePromise;
      expect(change.action).toBe("insert");
      if (!change.new_val) {
        throw new Error("expected changefeed to include new_val");
      }
      const newVal = change.new_val as { string_id?: string; patch?: string };
      expect(newVal.string_id).toBe(stringId);
      expect(newVal.patch).toBe(patch);
    } finally {
      changes.close();
      await deletePatches(stringId);
      await deleteSyncstring(stringId);
    }
  });
});
