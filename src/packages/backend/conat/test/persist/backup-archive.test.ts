/*
Testing automatic tiered storage and backup persistence functionality.
*/

import {
  before,
  after,
  connect,
  delay,
  client,
  wait,
} from "@cocalc/backend/conat/test/setup";
import { stream } from "@cocalc/conat/persist/client";
import { syncFiles } from "@cocalc/conat/persist/context";
import { pathExists } from "fs-extra";
import { join } from "path";
import * as fs from "fs/promises";
import { messageData } from "@cocalc/conat/core/client";
import { executeCode } from "@cocalc/backend/execute-code";
import sqlite from "better-sqlite3";
import { openPaths } from "@cocalc/conat/persist/storage";

beforeAll(async () => {
  await before({ archive: "archive", backup: "backup", archiveInterval: 250 });
});

describe("create persist server that also saves data to an archive folder and a backup folder", () => {
  it("verify that archive, backup and archiveInterval are all configured", async () => {
    expect(syncFiles.archive).toContain("archive");
    expect(syncFiles.archiveInterval).toBeGreaterThan(0);
    expect(syncFiles.backup).toContain("backup");
  });

  async function waitUntilClosed() {
    await wait({
      until: () => {
        return !openPaths.has(join(syncFiles.local, "hub/foo"));
      },
    });
  }

  let s1;
  it("create a new stream", async () => {
    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/foo" },
    });
    await s1.set({
      key: "my-key-1",
      messageData: messageData("one"),
    });
  });

  let local, archive, backup;
  it(`wait, then there is an updated archive file too`, async () => {
    ((local = join(syncFiles.local, "hub/foo.db")),
      (archive = join(syncFiles.archive, "hub/foo.db")),
      (backup = join(syncFiles.backup, "hub/foo.db")),
      expect(await pathExists(local)).toBe(true));
    // gets created initially
    expect(await pathExists(archive)).toBe(true);
    // backup should only exist when stream is closed
    expect(await pathExists(backup)).toBe(false);

    // timestamp before another write
    const stats = await fs.stat(archive);

    await s1.set({
      key: "my-key-2",
      messageData: messageData("two"),
    });
    // now wait to ensure archive gets written

    await delay(syncFiles.archiveInterval + 100);
    expect(await pathExists(archive)).toBe(true);
    const stats2 = await fs.stat(archive);
    expect(stats2.mtimeMs).not.toEqual(stats.mtimeMs);
  });

  it("close the stream and see that the backup and archive are both written, even though we didn't wait the full archive interval", async () => {
    s1.close();
    const t = Date.now();
    await wait({
      until: async () => await pathExists(backup),
    });
    expect(Date.now() - t).toBeLessThan(syncFiles.archiveInterval);
    expect(await pathExists(backup)).toBe(true);
    // at this point the actual sqlite3 database should be closed
  });

  const sha1 = async (path) => {
    const { stdout } = await executeCode({ command: "sha1sum", args: [path] });
    return stdout;
  };

  it("the backup, archive, and local files should all be identical as sqlite database", async () => {
    // they are not the same as files though so we need some care to compare them.
    expect(await serialize(local)).toEqual(await serialize(backup));
    expect(await serialize(archive)).toEqual(await serialize(backup));
  });

  it("delete the local copy and open stream, the data is still available", async () => {
    await fs.unlink(local);

    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/foo" },
    });
    const mesg = await s1.get({ key: "my-key-1" });
    expect(mesg.data).toBe("one");

    await s1.set({
      key: "my-key-3",
      messageData: messageData("three"),
    });

    s1.close();
    await waitUntilClosed();
  });

  it("delete the archive copy and open stream, the data is still available because local is used", async () => {
    await fs.unlink(archive);

    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/foo" },
    });
    const mesg = await s1.get({ key: "my-key-3" });
    expect(mesg.data).toBe("three");

    s1.close();
    await waitUntilClosed();
  });

  it("all should identical again sqlite database", async () => {
    // they are not the same as files though so we need some care to compare them.
    expect(await serialize(local)).toEqual(await serialize(backup));
    expect(await serialize(archive)).toEqual(await serialize(backup));
  });

  it("if both archive and local exist and local is newer, it is used", async () => {
    // grab copy of local
    const copy = local + ".copy";
    await fs.copyFile(local, copy);

    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/foo" },
    });
    await s1.set({
      key: "my-key-4",
      messageData: messageData("four"),
    });
    fs.unlink(backup);
    s1.close();
    await wait({
      until: async () => await pathExists(backup),
    });

    // ensure the old copy of local is the newer one by making archive old
    await fs.copyFile(copy, local);
    await fs.utimes(
      archive,
      Date.now() / 1000 - 100_000,
      Date.now() / 1000 - 100_000,
    );
    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/foo" },
    });
    expect((await s1.get({ key: "my-key-4" }))?.data).toEqual(undefined);

    s1.close();
    await waitUntilClosed();
  });

  it("if both archive and local exist and archive is newer, then archive is used", async () => {
    // grab copy of archive
    const copy = archive + ".copy";
    await fs.copyFile(archive, copy);

    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/foo" },
    });
    await s1.set({
      key: "my-key-5",
      messageData: messageData("five"),
    });
    s1.close();
    await waitUntilClosed();

    // ensure the old copy of archive is the newer one by making local old
    await fs.copyFile(copy, archive);
    await fs.utimes(
      local,
      Date.now() / 1000 - 100_000,
      Date.now() / 1000 - 100_000,
    );
    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/foo" },
    });
    expect((await s1.get({ key: "my-key-5" }))?.data).toEqual(undefined);

    s1.close();
    await waitUntilClosed();
  });

  it("another check all are equal now", async () => {
    //console.log("checking equality");
    expect(await serialize(local)).toEqual(await serialize(backup));
    expect(await serialize(archive)).toEqual(await serialize(backup));
  });

  it("deletes local and archive but not backup -- data is NOT available", async () => {
    await fs.unlink(local);
    await fs.unlink(archive);
    s1 = stream({
      client,
      user: { hub_id: "x" },
      storage: { path: "hub/foo" },
    });
    expect((await s1.get({ key: "my-key-1" }))?.data).toEqual(undefined);
  });
});

async function serialize(path: string): Promise<string> {
  while (true) {
    const db = new sqlite(path);
    try {
      const x = JSON.stringify({
        messages: db.prepare("select * from messages").all(),
        config: db.prepare("select * from config").all(),
      });
      db.close();
      return x;
    } catch (err) {
      console.log(err);
    }
    await delay(50);
  }
}

afterAll(async () => {
  after();
});
