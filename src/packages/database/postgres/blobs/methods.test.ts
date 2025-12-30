/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as miscNode from "@cocalc/backend/misc_node";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import type { PostgreSQL } from "@cocalc/database/postgres/types";
import { testCleanup } from "@cocalc/database/test-utils";
import { callback2 } from "@cocalc/util/async-utils";
import { uuid as randomUuid } from "@cocalc/util/misc";

type DbFn = () => PostgreSQL;

const originalBlobStore = process.env.COCALC_BLOB_STORE;
let blobStoreDir = "";
let db!: DbFn;

async function createTempDir(prefix: string): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix));
}

beforeAll(async () => {
  blobStoreDir = await createTempDir("cocalc-blob-store-");
  process.env.COCALC_BLOB_STORE = blobStoreDir;
  const dbModule = await import("@cocalc/database");
  db = dbModule.db;
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await testCleanup();
  if (blobStoreDir) {
    await rm(blobStoreDir, { recursive: true, force: true });
  }
  if (originalBlobStore == null) {
    delete process.env.COCALC_BLOB_STORE;
  } else {
    process.env.COCALC_BLOB_STORE = originalBlobStore;
  }
});

describe("save_blob and get_blob - basic operations", () => {
  const content = "test blob content for basic operations test suite";
  const blob = Buffer.from(content);
  const uuid = miscNode.uuidsha1(blob);

  it("saves a blob without options", async () => {
    const d = db();
    const ttl = await callback2(d.save_blob.bind(d), { blob });
    expect(ttl).toBe(0); // infinite ttl
  });

  it("retrieves the saved blob", async () => {
    const d = db();
    const retrieved = await callback2(d.get_blob.bind(d), { uuid });
    expect(retrieved).toBeDefined();
    expect(retrieved.toString()).toBe(content);
  });

  it("retrieves blob without touching", async () => {
    const d = db();
    const pool = getPool();

    // Get initial count
    const { rows: before } = await pool.query(
      "SELECT count FROM blobs WHERE id = $1",
      [uuid],
    );
    const initialCount = parseInt(before[0]?.count || "0");

    // Get blob without touching
    await callback2(d.get_blob.bind(d), { uuid, touch: false });

    // Count should not change
    const { rows: after } = await pool.query(
      "SELECT count FROM blobs WHERE id = $1",
      [uuid],
    );
    expect(parseInt(after[0].count)).toBe(initialCount);
  });

  it("touches blob when retrieving with touch=true", async () => {
    const d = db();
    const pool = getPool();

    // Get initial count
    const { rows: before } = await pool.query(
      "SELECT count FROM blobs WHERE id = $1",
      [uuid],
    );
    const initialCount = parseInt(before[0]?.count || "0");

    // Get blob with touching (default)
    await callback2(d.get_blob.bind(d), { uuid, touch: true });

    // Wait a moment for touch to complete (it happens after callback)
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Count should increase
    const { rows: after } = await pool.query(
      "SELECT count FROM blobs WHERE id = $1",
      [uuid],
    );
    expect(parseInt(after[0].count)).toBeGreaterThan(initialCount);
  });
});

describe("save_blob - with explicit uuid", () => {
  const content = "test blob with uuid explicit uuid test suite unique";
  const blob = Buffer.from(content);
  const uuid = miscNode.uuidsha1(blob);

  it("saves blob with matching uuid", async () => {
    const d = db();
    const ttl = await callback2(d.save_blob.bind(d), { blob, uuid });
    expect(ttl).toBe(0);
  });

  it("retrieves blob by uuid", async () => {
    const d = db();
    const retrieved = await callback2(d.get_blob.bind(d), { uuid });
    expect(retrieved.toString()).toBe(content);
  });

  it("rejects blob with mismatched uuid when check=true", async () => {
    const d = db();
    const wrongUuid = "550e8400-e29b-41d4-a716-446655440000";

    await expect(
      callback2(d.save_blob.bind(d), { blob, uuid: wrongUuid, check: true }),
    ).rejects.toMatch(/sha1 uuid.*must equal/);
  });

  it("rejects invalid uuid", async () => {
    const d = db();

    await expect(
      callback2(d.save_blob.bind(d), { blob, uuid: "invalid-uuid" }),
    ).rejects.toMatch(/uuid is invalid/);
  });
});

describe("save_blob - with compression", () => {
  const content = "x".repeat(1000) + " compression test suite unique"; // Compressible content
  const blob = Buffer.from(content);
  const gzipUuid = miscNode.uuidsha1(blob);

  it("saves blob with gzip compression", async () => {
    const d = db();
    const pool = getPool();

    await callback2(d.save_blob.bind(d), {
      blob,
      uuid: gzipUuid,
      compress: "gzip",
    });

    // Check that compress field is set
    const { rows } = await pool.query(
      "SELECT compress, size FROM blobs WHERE id = $1",
      [gzipUuid],
    );
    expect(rows[0].compress).toBe("gzip");
  });

  it("retrieves and decompresses gzip blob", async () => {
    const d = db();
    const retrieved = await callback2(d.get_blob.bind(d), { uuid: gzipUuid });
    expect(retrieved.toString()).toBe(content);
  });

  const zlibContent = "y".repeat(1000) + " zlib test unique";
  const zlibUuid = miscNode.uuidsha1(Buffer.from(zlibContent));

  it("saves blob with zlib compression", async () => {
    const d = db();
    const blob2 = Buffer.from(zlibContent);
    const pool = getPool();

    await callback2(d.save_blob.bind(d), {
      blob: blob2,
      uuid: zlibUuid,
      compress: "zlib",
      level: 6,
    });

    const { rows } = await pool.query(
      "SELECT compress FROM blobs WHERE id = $1",
      [zlibUuid],
    );
    expect(rows[0].compress).toBe("zlib");
  });

  it("retrieves and decompresses zlib blob", async () => {
    const d = db();
    const retrieved = await callback2(d.get_blob.bind(d), { uuid: zlibUuid });
    expect(retrieved.toString()).toBe(zlibContent);
  });

  it("rejects unsupported compression format", async () => {
    const d = db();
    const blob3 = Buffer.from("test");

    await expect(
      callback2(d.save_blob.bind(d), {
        blob: blob3,
        compress: "brotli" as any,
      }),
    ).rejects.toMatch(/compression format.*not implemented/);
  });
});

describe("save_blob - with TTL", () => {
  it("saves blob with finite TTL", async () => {
    const content = "blob with initial TTL";
    const blob = Buffer.from(content);
    const uuid = miscNode.uuidsha1(blob);
    const ttl = 3600;

    const d = db();
    const returnedTtl = await callback2(d.save_blob.bind(d), {
      blob,
      uuid,
      ttl,
    });
    expect(returnedTtl).toBe(ttl);

    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT expire FROM blobs WHERE id = $1",
      [uuid],
    );
    expect(rows[0].expire).toBeDefined();
    expect(rows[0].expire).not.toBeNull();
  });

  it("extends TTL when saving again with longer TTL", async () => {
    const content = "blob for TTL extension test";
    const blob = Buffer.from(content);
    const uuid = miscNode.uuidsha1(blob);

    const d = db();
    const pool = getPool();

    // Save with initial TTL
    await callback2(d.save_blob.bind(d), { blob, uuid, ttl: 3600 });

    const { rows: before } = await pool.query(
      "SELECT expire FROM blobs WHERE id = $1",
      [uuid],
    );
    const oldExpire = before[0].expire;

    // Save again with longer TTL
    await callback2(d.save_blob.bind(d), { blob, uuid, ttl: 7200 });

    const { rows: after } = await pool.query(
      "SELECT expire FROM blobs WHERE id = $1",
      [uuid],
    );
    expect(after[0].expire.getTime()).toBeGreaterThan(oldExpire.getTime());
  });

  it("keeps existing TTL when saving with shorter TTL", async () => {
    const content = "blob for TTL keep test";
    const blob = Buffer.from(content);
    const uuid = miscNode.uuidsha1(blob);

    const d = db();
    const pool = getPool();

    // Save with initial TTL
    await callback2(d.save_blob.bind(d), { blob, uuid, ttl: 7200 });

    const { rows: before } = await pool.query(
      "SELECT expire FROM blobs WHERE id = $1",
      [uuid],
    );
    const currentExpire = before[0].expire;

    // Save again with shorter TTL
    await callback2(d.save_blob.bind(d), { blob, uuid, ttl: 1800 });

    const { rows: after } = await pool.query(
      "SELECT expire FROM blobs WHERE id = $1",
      [uuid],
    );
    expect(after[0].expire.getTime()).toBe(currentExpire.getTime());
  });

  it("makes TTL infinite when saving with ttl=0", async () => {
    const content = "blob for infinite TTL test";
    const blob = Buffer.from(content);
    const uuid = miscNode.uuidsha1(blob);

    const d = db();
    const pool = getPool();

    // First save with finite TTL
    await callback2(d.save_blob.bind(d), { blob, uuid, ttl: 3600 });

    // Then make it infinite
    await callback2(d.save_blob.bind(d), { blob, uuid, ttl: 0 });

    const { rows } = await pool.query(
      "SELECT expire FROM blobs WHERE id = $1",
      [uuid],
    );
    expect(rows[0].expire).toBeNull();
  });
});

describe("save_blob - with project_id and account_id", () => {
  const content = "blob with metadata for project account test unique";
  const blob = Buffer.from(content);
  const uuid = miscNode.uuidsha1(blob);
  const project_id = "550e8400-e29b-41d4-a716-446655440000";
  const account_id = "660e8400-e29b-41d4-a716-446655440001";

  it("saves blob with project_id and account_id", async () => {
    const d = db();
    await callback2(d.save_blob.bind(d), {
      blob,
      uuid,
      project_id,
      account_id,
    });
  });

  it("metadata is stored correctly", async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT project_id, account_id FROM blobs WHERE id = $1",
      [uuid],
    );
    expect(rows[0].project_id).toBe(project_id);
    expect(rows[0].account_id).toBe(account_id);
  });
});

describe("get_blob - expiration handling", () => {
  const content = `expired blob for expiration test ${randomUuid()}`;
  const blob = Buffer.from(content);
  const uuid = miscNode.uuidsha1(blob);

  it("sets up an already-expired blob", async () => {
    const pool = getPool();
    // Insert blob that expired 1 hour ago
    const pastExpire = new Date(Date.now() - 3600 * 1000);
    await pool.query("INSERT INTO blobs(id, blob, expire) VALUES($1, $2, $3)", [
      uuid,
      blob,
      pastExpire,
    ]);
  });

  it("returns undefined for expired blob", async () => {
    const d = db();
    const retrieved = await callback2(d.get_blob.bind(d), { uuid });
    expect(retrieved).toBeUndefined();
  });

  it("expired blob is deleted from database", async () => {
    const pool = getPool();
    // Give it a moment for background delete
    await new Promise((resolve) => setTimeout(resolve, 100));

    const { rows } = await pool.query("SELECT id FROM blobs WHERE id = $1", [
      uuid,
    ]);
    expect(rows.length).toBe(0);
  });
});

describe("touch_blob", () => {
  const content = "blob to touch for touch test unique";
  const blob = Buffer.from(content);
  const uuid = miscNode.uuidsha1(blob);

  it("creates blob for touching test", async () => {
    const d = db();
    await callback2(d.save_blob.bind(d), { blob, uuid });
  });

  it("increments count when touched", async () => {
    const d = db();
    const pool = getPool();

    const { rows: before } = await pool.query(
      "SELECT count FROM blobs WHERE id = $1",
      [uuid],
    );
    const initialCount = parseInt(before[0].count);

    await callback2(d.touch_blob.bind(d), { uuid });

    const { rows: after } = await pool.query(
      "SELECT count FROM blobs WHERE id = $1",
      [uuid],
    );
    expect(parseInt(after[0].count)).toBe(initialCount + 1);
  });

  it("updates last_active timestamp", async () => {
    const d = db();
    const pool = getPool();

    const { rows: before } = await pool.query(
      "SELECT last_active FROM blobs WHERE id = $1",
      [uuid],
    );
    const oldTimestamp = before[0].last_active;

    // Wait a bit to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    await callback2(d.touch_blob.bind(d), { uuid });

    const { rows: after } = await pool.query(
      "SELECT last_active FROM blobs WHERE id = $1",
      [uuid],
    );

    if (oldTimestamp) {
      expect(after[0].last_active.getTime()).toBeGreaterThan(
        oldTimestamp.getTime(),
      );
    }
  });

  it("rejects invalid uuid", async () => {
    const d = db();
    await expect(
      callback2(d.touch_blob.bind(d), { uuid: "invalid" }),
    ).rejects.toMatch(/uuid is invalid/);
  });
});

describe("remove_blob_ttls", () => {
  const timestamp = Date.now();
  const blobs = [
    { content: `blob1 for remove ttl test ${timestamp}`, ttl: 3600 },
    { content: `blob2 for remove ttl test ${timestamp}`, ttl: 7200 },
    { content: `blob3 for remove ttl test ${timestamp}`, ttl: 1800 },
  ];
  const uuids = blobs.map((b) => miscNode.uuidsha1(Buffer.from(b.content)));

  it("creates blobs with TTLs", async () => {
    const d = db();
    const pool = getPool();

    for (let i = 0; i < blobs.length; i++) {
      const ttl = await callback2(d.save_blob.bind(d), {
        blob: Buffer.from(blobs[i].content),
        uuid: uuids[i],
        ttl: blobs[i].ttl,
      });

      // Debug: log what we got back and what's in DB
      const { rows } = await pool.query(
        "SELECT expire, id FROM blobs WHERE id = $1",
        [uuids[i]],
      );

      if (rows.length === 0) {
        throw new Error(`Blob ${i} was not created!`);
      }

      if (rows[0].expire === null) {
        console.log(`Blob ${i} details:`, {
          requestedTtl: blobs[i].ttl,
          returnedTtl: ttl,
          expire: rows[0].expire,
          uuid: uuids[i],
        });
      }

      expect(rows.length).toBe(1);
      expect(ttl).toBe(blobs[i].ttl);
      expect(rows[0].expire).not.toBeNull();
    }
  });

  it("all blobs still have expire set", async () => {
    // Already verified in "creates blobs with TTLs" test,
    // but checking again to ensure no external interference
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT COUNT(*) as count FROM blobs WHERE id = ANY($1) AND expire IS NOT NULL",
      [uuids],
    );
    expect(parseInt(rows[0].count)).toBe(blobs.length);
  });

  it("removes TTLs from specified blobs", async () => {
    const d = db();
    await callback2(d.remove_blob_ttls.bind(d), { uuids });
  });

  it("blobs now have null expire", async () => {
    const pool = getPool();
    for (const uuid of uuids) {
      const { rows } = await pool.query(
        "SELECT expire FROM blobs WHERE id = $1",
        [uuid],
      );
      expect(rows[0].expire).toBeNull();
    }
  });

  it("ignores invalid uuids in array", async () => {
    const d = db();
    // Should not throw even with invalid uuids mixed in
    await callback2(d.remove_blob_ttls.bind(d), {
      uuids: [...uuids, "invalid-uuid-1", "invalid-uuid-2"],
    });
  });
});

describe("delete_blob", () => {
  const content = "blob to delete for delete test unique";
  const blob = Buffer.from(content);
  const uuid = miscNode.uuidsha1(blob);

  it("creates blob for deletion test", async () => {
    const d = db();
    await callback2(d.save_blob.bind(d), { blob, uuid });
  });

  it("blob exists in database", async () => {
    const pool = getPool();
    const { rows } = await pool.query("SELECT id FROM blobs WHERE id = $1", [
      uuid,
    ]);
    expect(rows.length).toBe(1);
  });

  it("deletes the blob", async () => {
    const d = db();
    await callback2(d.delete_blob.bind(d), { uuid });
  });

  it("blob no longer exists in database", async () => {
    const pool = getPool();
    const { rows } = await pool.query("SELECT id FROM blobs WHERE id = $1", [
      uuid,
    ]);
    expect(rows.length).toBe(0);
  });

  it("returns undefined when getting deleted blob", async () => {
    const d = db();
    const retrieved = await callback2(d.get_blob.bind(d), { uuid });
    expect(retrieved).toBeUndefined();
  });

  it("rejects invalid uuid", async () => {
    const d = db();
    await expect(
      callback2(d.delete_blob.bind(d), { uuid: "invalid" }),
    ).rejects.toMatch(/uuid is invalid/);
  });
});

describe("import_patches", () => {
  const string_id = "test-string-id-for-import";
  const patches = [
    {
      string_id,
      time: new Date("2024-01-01T00:00:00Z"),
      user_id: 1,
      patch: "patch1",
      is_snapshot: false,
    },
    {
      string_id,
      time: new Date("2024-01-01T00:01:00Z"),
      user_id: 1,
      patch: "patch2",
      is_snapshot: false,
    },
  ];

  it("imports patches successfully", async () => {
    const d = db();
    await callback2(d.import_patches.bind(d), { patches });
  });

  it("patches are in database", async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT COUNT(*) as count FROM patches WHERE string_id = $1",
      [string_id],
    );
    expect(parseInt(rows[0].count)).toBe(2);
  });

  it("imports with string_id override", async () => {
    const d = db();
    const newStringId = "overridden-string-id";
    await callback2(d.import_patches.bind(d), {
      patches,
      string_id: newStringId,
    });

    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT COUNT(*) as count FROM patches WHERE string_id = $1",
      [newStringId],
    );
    expect(parseInt(rows[0].count)).toBe(2);
  });

  it("handles empty patches array", async () => {
    const d = db();
    await callback2(d.import_patches.bind(d), { patches: [] });
  });

  it("handles ON CONFLICT (idempotent)", async () => {
    const d = db();
    // Import same patches again - should not error
    await callback2(d.import_patches.bind(d), { patches });
  });
});

describe("import_patches - legacy format", () => {
  const stringId = miscNode.sha1(`legacy-import-${randomUuid()}`);
  const time = new Date("2024-02-01T00:00:00Z");
  const sent = new Date("2024-02-01T00:00:30Z");
  const prev = new Date("2024-02-01T00:00:15Z");
  const patches = [
    {
      id: [stringId, time.toISOString()],
      user: 5,
      patch: "legacy patch",
      snapshot: "legacy snapshot",
      sent,
      prev,
    },
  ];

  it("rejects legacy patch format due to missing is_snapshot", async () => {
    const d = db();
    await expect(
      callback2(d.import_patches.bind(d), { patches }),
    ).rejects.toMatch(/is_snapshot/);
  });
});

describe("export_patches", () => {
  const stringId = miscNode.sha1(`export-${randomUuid()}`);
  const time1 = new Date("2024-03-01T00:00:00Z");
  const time2 = new Date("2024-03-01T00:01:00Z");

  beforeAll(async () => {
    const pool = getPool();
    await pool.query(
      "INSERT INTO patches(string_id, time, patch, is_snapshot) VALUES($1, $2, $3, false)",
      [stringId, time1, "patch-one"],
    );
    await pool.query(
      "INSERT INTO patches(string_id, time, patch, is_snapshot) VALUES($1, $2, $3, false)",
      [stringId, time2, "patch-two"],
    );
  });

  it("returns patches for a syncstring", async () => {
    const d = db();
    const patches = await callback2(d.export_patches.bind(d), {
      string_id: stringId,
    });
    const patchTexts = patches.map((patch) => patch.patch);
    expect(patches.length).toBe(2);
    expect(patchTexts).toEqual(
      expect.arrayContaining(["patch-one", "patch-two"]),
    );
  });
});

describe("get_blob - gcloud fallback", () => {
  const content = `blob stored in gcloud for fallback test ${randomUuid()}`;
  const blob = Buffer.from(content);
  const uuid = miscNode.uuidsha1(blob);

  it("reads from blob store when blob column is null", async () => {
    const d = db();
    const pool = getPool();
    await callback2(d.save_blob.bind(d), { blob, uuid });
    await callback2(d.copy_blob_to_gcloud.bind(d), {
      uuid,
      bucket: blobStoreDir,
      remove: true,
    });

    const { rows: before } = await pool.query(
      "SELECT blob, gcloud FROM blobs WHERE id = $1",
      [uuid],
    );
    expect(before[0].blob).toBeNull();
    expect(before[0].gcloud).toBe(blobStoreDir);

    const retrieved = await callback2(d.get_blob.bind(d), {
      uuid,
      save_in_db: true,
      touch: false,
    });
    expect(retrieved.toString()).toBe(content);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const { rows: after } = await pool.query(
      "SELECT blob FROM blobs WHERE id = $1",
      [uuid],
    );
    expect(after[0].blob).toBeDefined();
  });
});

describe("copy_blob_to_gcloud", () => {
  const content = `test blob content for gcloud copy ${randomUuid()}`;
  const blob = Buffer.from(content);
  const uuid = miscNode.uuidsha1(blob);
  let bucketDir = "";

  beforeAll(async () => {
    bucketDir = await createTempDir("cocalc-blob-gcloud-");
  });

  afterAll(async () => {
    if (bucketDir) {
      await rm(bucketDir, { recursive: true, force: true });
    }
  });

  it("copies blob to filesystem bucket and records gcloud", async () => {
    const d = db();
    await callback2(d.save_blob.bind(d), { blob, uuid });
    await callback2(d.copy_blob_to_gcloud.bind(d), {
      uuid,
      bucket: bucketDir,
    });

    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT blob, gcloud FROM blobs WHERE id = $1",
      [uuid],
    );
    expect(rows[0].gcloud).toBe(bucketDir);
    expect(rows[0].blob).toBeDefined();

    const stored = await readFile(join(bucketDir, uuid));
    expect(stored.toString()).toBe(content);
  });

  it("removes blob data when remove=true", async () => {
    const d = db();
    const removeBlob = Buffer.from(
      `remove blob after gcloud copy ${randomUuid()}`,
    );
    const removeUuid = miscNode.uuidsha1(removeBlob);
    await callback2(d.save_blob.bind(d), {
      blob: removeBlob,
      uuid: removeUuid,
    });
    await callback2(d.copy_blob_to_gcloud.bind(d), {
      uuid: removeUuid,
      bucket: blobStoreDir,
      remove: true,
    });

    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT blob, gcloud FROM blobs WHERE id = $1",
      [removeUuid],
    );
    expect(rows[0].gcloud).toBe(blobStoreDir);
    expect(rows[0].blob).toBeNull();
  });
});

describe("close_blob", () => {
  const content = `blob content for close_blob ${randomUuid()}`;
  const blob = Buffer.from(content);
  const uuid = miscNode.uuidsha1(blob);

  it("returns an error from the final query", async () => {
    const d = db();
    await callback2(d.save_blob.bind(d), { blob, uuid });
    await expect(
      callback2(d.close_blob.bind(d), { uuid, bucket: blobStoreDir }),
    ).rejects.toMatch(/syntax error/i);
  });
});

describe("copy_all_blobs_to_gcloud", () => {
  const timestamp = Date.now();
  const infiniteContent = `copy-all infinite ${timestamp}`;
  const finiteContent = `copy-all finite ${timestamp}`;
  const infiniteBlob = Buffer.from(infiniteContent);
  const finiteBlob = Buffer.from(finiteContent);
  const infiniteUuid = miscNode.uuidsha1(infiniteBlob);
  const finiteUuid = miscNode.uuidsha1(finiteBlob);
  let bucketDir = "";

  beforeAll(async () => {
    bucketDir = await createTempDir("cocalc-copy-all-");
  });

  afterAll(async () => {
    if (bucketDir) {
      await rm(bucketDir, { recursive: true, force: true });
    }
  });

  it("copies only infinite-ttl blobs", async () => {
    const d = db();
    await callback2(d.save_blob.bind(d), {
      blob: infiniteBlob,
      uuid: infiniteUuid,
      ttl: 0,
    });
    await callback2(d.save_blob.bind(d), {
      blob: finiteBlob,
      uuid: finiteUuid,
      ttl: 3600,
    });

    await callback2(d.copy_all_blobs_to_gcloud.bind(d), {
      bucket: bucketDir,
      limit: 1000,
      map_limit: 1,
      throttle: 0,
      repeat_until_done_s: 0,
      remove: false,
      cutoff: "0 seconds",
    });

    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT id, gcloud FROM blobs WHERE id = ANY($1)",
      [[infiniteUuid, finiteUuid]],
    );
    const gcloudById = new Map(rows.map((row) => [row.id, row.gcloud]));
    expect(gcloudById.get(infiniteUuid)).toBe(bucketDir);
    expect(gcloudById.get(finiteUuid)).toBeNull();

    const stored = await readFile(join(bucketDir, infiniteUuid));
    expect(stored.toString()).toBe(infiniteContent);
  });
});

describe("backup_blobs_to_tarball", () => {
  const content = `backup blob content ${randomUuid()}`;
  const blob = Buffer.from(content);
  const uuid = miscNode.uuidsha1(blob);
  let backupDir = "";
  let executeCodeSpy: jest.SpyInstance | undefined;

  beforeAll(async () => {
    backupDir = await createTempDir("cocalc-blob-backup-");
    executeCodeSpy = jest
      .spyOn(miscNode, "execute_code")
      .mockImplementation((opts) => {
        opts.cb?.(undefined);
      });
  });

  afterAll(async () => {
    executeCodeSpy?.mockRestore();
    if (backupDir) {
      await rm(backupDir, { recursive: true, force: true });
    }
  });

  it("marks blobs as backed up", async () => {
    const d = db();
    const pool = getPool();
    await callback2(d.save_blob.bind(d), { blob, uuid });
    await pool.query("UPDATE blobs SET backup = true WHERE id != $1", [uuid]);

    const tarball = await callback2(d.backup_blobs_to_tarball.bind(d), {
      limit: 1000,
      path: backupDir,
      throttle: 0,
      repeat_until_done: 0,
      map_limit: 1,
    });

    const call = executeCodeSpy?.mock.calls[0]?.[0];
    expect(call?.command).toBe("tar");
    expect(call?.args?.[1]).toBe(tarball);

    const { rows } = await pool.query(
      "SELECT backup FROM blobs WHERE id = $1",
      [uuid],
    );
    expect(rows[0].backup).toBe(true);
  });
});

describe("blob_maintenance", () => {
  const content = `maintenance blob content ${randomUuid()}`;
  const blob = Buffer.from(content);
  const uuid = miscNode.uuidsha1(blob);
  let backupDir = "";
  let executeCodeSpy: jest.SpyInstance | undefined;

  beforeAll(async () => {
    backupDir = await createTempDir("cocalc-blob-maintenance-");
    executeCodeSpy = jest
      .spyOn(miscNode, "execute_code")
      .mockImplementation((opts) => {
        opts.cb?.(undefined);
      });
  });

  afterAll(async () => {
    executeCodeSpy?.mockRestore();
    if (backupDir) {
      await rm(backupDir, { recursive: true, force: true });
    }
  });

  it("backs up and copies blobs to blob store", async () => {
    const d = db();
    const pool = getPool();
    await callback2(d.save_blob.bind(d), { blob, uuid, ttl: 0 });
    await pool.query(
      "UPDATE blobs SET backup = true, expire = NOW() WHERE id != $1",
      [uuid],
    );

    await callback2(d.blob_maintenance.bind(d), {
      path: backupDir,
      map_limit: 1,
      blobs_per_tarball: 1000,
      throttle: 0,
      syncstring_delay: 0,
      backup_repeat: 0,
      copy_repeat_s: 0,
    });

    const { rows } = await pool.query(
      "SELECT backup, gcloud, blob FROM blobs WHERE id = $1",
      [uuid],
    );
    expect(rows[0].backup).toBe(true);
    expect(rows[0].gcloud).toBe(blobStoreDir);
    expect(rows[0].blob).toBeNull();

    const stored = await readFile(join(blobStoreDir, uuid));
    expect(stored.toString()).toBe(content);
  });
});

describe("syncstring_maintenance", () => {
  const projectId = randomUuid();
  const path = "maintenance.txt";
  const stringId = miscNode.sha1(`${projectId}/${path}`);
  const patchTime = new Date("2024-01-01T00:00:00Z");
  const lastActive = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    const pool = getPool();
    await pool.query(
      "INSERT INTO syncstrings(string_id, project_id, path, last_active) VALUES($1, $2, $3, $4)",
      [stringId, projectId, path, lastActive],
    );
    await pool.query(
      "INSERT INTO patches(string_id, time, patch, is_snapshot) VALUES($1, $2, $3, false)",
      [stringId, patchTime, "maintenance patch"],
    );
  });

  it("archives patches for inactive syncstrings", async () => {
    const d = db();
    const consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      await callback2(d.syncstring_maintenance.bind(d), {
        age_days: 1,
        map_limit: 1,
        limit: 10,
        repeat_until_done: false,
        delay: 0,
      });

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining(`archiving string ${stringId}`),
      );
    } finally {
      consoleLog.mockRestore();
    }

    const pool = getPool();
    const { rows: syncRows } = await pool.query(
      "SELECT archived FROM syncstrings WHERE string_id = $1",
      [stringId],
    );
    expect(syncRows[0].archived).toBeTruthy();

    const archivedId = syncRows[0].archived;
    const { rows: patchRows } = await pool.query(
      "SELECT COUNT(*) as count FROM patches WHERE string_id = $1",
      [stringId],
    );
    expect(patchRows[0].count).toBe("0");

    const { rows: blobRows } = await pool.query(
      "SELECT id FROM blobs WHERE id = $1",
      [archivedId],
    );
    expect(blobRows.length).toBe(1);
  });
});
