/*
DEVELOPMENT:

This is a unit test of pull replication.  This involves ssh to root
on localhost, and creating multiple pools, so use with caution and don't
expect this to work unless you really know what you're doing...

*/

import { join } from "path";
import { createTestPools, deleteTestPools, init, describe } from "./util";
import {
  createFilesystem,
  createSnapshot,
  pullAll,
} from "@cocalc/file-server/zfs";
import { context, setContext } from "@cocalc/file-server/zfs/config";
import { filesystemMountpoint } from "@cocalc/file-server/zfs/names";
import { readFile, writeFile } from "fs/promises";
import { filesystemExists, get } from "@cocalc/file-server/zfs/db";

describe("create two separate file servers, then do a pull to sync one to the other", () => {
  let one: any = null,
    two: any = null;
  const prefix1 = context.PREFIX + ".1";
  const prefix2 = context.PREFIX + ".2";

  beforeAll(async () => {
    one = await createTestPools({ count: 1, size: "1G", prefix: prefix1 });
    setContext({ prefix: prefix1 });
    await init();
    two = await createTestPools({
      count: 1,
      size: "1G",
      prefix: prefix2,
    });
    setContext({ prefix: prefix2 });
    await init();
  });

  afterAll(async () => {
    await deleteTestPools(one);
    await deleteTestPools(two);
  });

  it("creates a filesystem in pool one, writes a file and takes a snapshot", async () => {
    setContext({ prefix: prefix1 });
    const fs = await createFilesystem({
      project_id: "00000000-0000-0000-0000-000000000001",
    });
    await writeFile(join(filesystemMountpoint(fs), "a.txt"), "hello");
    await createSnapshot(fs);
    expect(await filesystemExists(fs)).toEqual(true);
  });

  it("pulls filesystem one to filesystem two, and confirms the fs and file were indeed sync'd", async () => {
    setContext({ prefix: prefix2 });
    expect(
      await filesystemExists({
        project_id: "00000000-0000-0000-0000-000000000001",
      }),
    ).toEqual(false);

    // first dryRun
    const { toUpdate, toDelete } = await pullAll({
      remote: "root@localhost",
      prefix: prefix1,
      dryRun: true,
    });
    expect(toDelete.length).toBe(0);
    expect(toUpdate.length).toBe(1);
    expect(toUpdate[0].remoteFs.owner_id).toEqual(
      "00000000-0000-0000-0000-000000000001",
    );
    expect(toUpdate[0].localFs).toBe(undefined);

    // now for real
    const { toUpdate: toUpdate1, toDelete: toDelete1 } = await pullAll({
      remote: "root@localhost",
      prefix: prefix1,
    });

    expect(toDelete1).toEqual(toDelete);
    expect(toUpdate1).toEqual(toUpdate);

    const fs = {
      project_id: "00000000-0000-0000-0000-000000000001",
    };
    expect(await filesystemExists(fs)).toEqual(true);
    expect(
      (await readFile(join(filesystemMountpoint(fs), "a.txt"))).toString(),
    ).toEqual("hello");

    // nothing if we sync again:
    const { toUpdate: toUpdate2, toDelete: toDelete2 } = await pullAll({
      remote: "root@localhost",
      prefix: prefix1,
    });
    expect(toDelete2.length).toBe(0);
    expect(toUpdate2.length).toBe(0);
  });

  it("creates another file in our filesystem, creates another snapshot, syncs again, and sees that the sync worked", async () => {
    setContext({ prefix: prefix1 });
    const fs = {
      project_id: "00000000-0000-0000-0000-000000000001",
    };
    await writeFile(join(filesystemMountpoint(fs), "b.txt"), "cocalc");
    await createSnapshot({ ...fs, force: true });
    const { snapshots } = get(fs);
    expect(snapshots.length).toBe(2);

    setContext({ prefix: prefix2 });
    await pullAll({
      remote: "root@localhost",
      prefix: prefix1,
    });

    expect(
      (await readFile(join(filesystemMountpoint(fs), "b.txt"))).toString(),
    ).toEqual("cocalc");
  });

  //it("archives the project, does sync, and see the other one got archived")
  //it('dearchives, does sync, then sees the other gets dearchived')
  //it('deletes it, does sync, then sees the other gets deleted')
});
