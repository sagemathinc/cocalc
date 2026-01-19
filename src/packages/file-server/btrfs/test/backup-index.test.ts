import { after, before, fs } from "./setup";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";

import { buildBackupIndex } from "../backup-index";

beforeAll(before);

describe("backup index", () => {
  it("builds an index with files from a snapshot", async () => {
    const vol = await fs.subvolumes.ensure("backup-index-test");
    await vol.fs.writeFile("a.txt", "hello");
    await vol.fs.mkdir("dir");
    await vol.fs.writeFile("dir/b.txt", "world");
    await vol.fs.writeFile("line\nbreak.txt", "nl");

    await vol.snapshots.create("snap");
    const snapshotPath = join(vol.path, vol.snapshots.path("snap"));

    const tempDir = await mkdtemp(join(tmpdir(), "backup-index-test-"));
    const outputPath = join(tempDir, "backup.sqlite");

    await buildBackupIndex({
      snapshotPath,
      outputPath,
      meta: {
        backupId: "snap",
        backupTime: new Date("2026-01-01T00:00:00Z"),
        snapshotId: "snap",
      },
    });

    const db = new DatabaseSync(outputPath);
    try {
      const files = db
        .prepare("SELECT parent, name, type FROM files ORDER BY parent, name")
        .all() as { parent: string; name: string; type: string }[];
      const paths = files.map((row) =>
        row.parent ? `${row.parent}/${row.name}` : row.name,
      );
      expect(paths).toEqual(
        expect.arrayContaining(["a.txt", "dir/b.txt", "line\nbreak.txt"]),
      );
      expect(
        files.find((row) => row.parent === "" && row.name === "a.txt")?.type,
      ).toBe("f");

      const meta = db
        .prepare("SELECT key, value FROM meta ORDER BY key")
        .all() as { key: string; value: string }[];
      const metaMap = Object.fromEntries(meta.map((row) => [row.key, row.value]));
      expect(metaMap.backup_id).toBe("snap");
      expect(metaMap.snapshot_id).toBe("snap");
      expect(metaMap.backup_time).toBe("2026-01-01T00:00:00.000Z");
    } finally {
      db.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

afterAll(after);
