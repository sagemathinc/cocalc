/*
DEVELOPMENT:

This tests pull replication by setting up two separate file-servers on disk locally
and doing pulls from one to the other over ssh.   This involves password-less ssh
to root on localhost, and creating multiple pools, so use with caution and don't
expect this to work unless you really know what you're doing.
Also, these tests are going to take a while.

Efficient powerful backup isn't trivial and is very valuable, so
its' worth the wait!

pnpm exec jest --watch pull.test.ts
*/

import { join } from "path";
import { createTestPools, deleteTestPools, init, describe } from "./util";
import {
  createFilesystem,
  createSnapshot,
  deleteSnapshot,
  deleteFilesystem,
  pull,
  archiveFilesystem,
  dearchiveFilesystem,
} from "@cocalc/file-server/zfs";
import { context, setContext } from "@cocalc/file-server/zfs/config";
import { filesystemMountpoint } from "@cocalc/file-server/zfs/names";
import { readFile, writeFile } from "fs/promises";
import { filesystemExists, get } from "@cocalc/file-server/zfs/db";
import { SYNCED_FIELDS } from "../pull";

describe("create two separate file servers, then do pulls to sync one to the other under various conditions", () => {
  let one: any = null,
    two: any = null;
  const data1 = context.DATA + ".1";
  const data2 = context.DATA + ".2";
  const remote = "root@localhost";

  beforeAll(async () => {
    one = await createTestPools({ count: 1, size: "1G", data: data1 });
    setContext({ data: data1 });
    await init();
    two = await createTestPools({
      count: 1,
      size: "1G",
      data: data2,
    });
    setContext({ data: data2 });
    await init();
  });

  afterAll(async () => {
    await deleteTestPools(one);
    await deleteTestPools(two);
  });

  it("creates a filesystem in pool one, writes a file and takes a snapshot", async () => {
    setContext({ data: data1 });
    const fs = await createFilesystem({
      project_id: "00000000-0000-0000-0000-000000000001",
    });
    await writeFile(join(filesystemMountpoint(fs), "a.txt"), "hello");
    await createSnapshot(fs);
    expect(await filesystemExists(fs)).toEqual(true);
  });

  it("pulls filesystem one to filesystem two, and confirms the fs and file were indeed sync'd", async () => {
    setContext({ data: data2 });
    expect(
      await filesystemExists({
        project_id: "00000000-0000-0000-0000-000000000001",
      }),
    ).toEqual(false);

    // first dryRun
    const { toUpdate, toDelete } = await pull({
      remote,
      data: data1,
      dryRun: true,
    });
    expect(toDelete.length).toBe(0);
    expect(toUpdate.length).toBe(1);
    expect(toUpdate[0].remoteFs.owner_id).toEqual(
      "00000000-0000-0000-0000-000000000001",
    );
    expect(toUpdate[0].localFs).toBe(undefined);

    // now for real
    const { toUpdate: toUpdate1, toDelete: toDelete1 } = await pull({
      remote,
      data: data1,
    });

    expect(toDelete1).toEqual(toDelete);
    expect(toUpdate1).toEqual(toUpdate);
    const fs = { project_id: "00000000-0000-0000-0000-000000000001" };
    expect(await filesystemExists(fs)).toEqual(true);
    expect(
      (await readFile(join(filesystemMountpoint(fs), "a.txt"))).toString(),
    ).toEqual("hello");

    // nothing if we sync again:
    const { toUpdate: toUpdate2, toDelete: toDelete2 } = await pull({
      remote,
      data: data1,
    });
    expect(toDelete2.length).toBe(0);
    expect(toUpdate2.length).toBe(0);
  });

  it("creates another file in our filesystem, creates another snapshot, syncs again, and sees that the sync worked", async () => {
    setContext({ data: data1 });
    const fs = { project_id: "00000000-0000-0000-0000-000000000001" };
    await writeFile(join(filesystemMountpoint(fs), "b.txt"), "cocalc");
    await createSnapshot({ ...fs, force: true });
    const { snapshots } = get(fs);
    expect(snapshots.length).toBe(2);

    setContext({ data: data2 });
    await pull({ remote, data: data1 });

    expect(
      (await readFile(join(filesystemMountpoint(fs), "b.txt"))).toString(),
    ).toEqual("cocalc");
  });

  it("archives the project, does sync, and see the other one got archived", async () => {
    const fs = { project_id: "00000000-0000-0000-0000-000000000001" };
    setContext({ data: data2 });
    const project2before = get(fs);
    expect(project2before.archived).toBe(false);

    setContext({ data: data1 });
    await archiveFilesystem(fs);
    const project1 = get(fs);
    expect(project1.archived).toBe(true);

    setContext({ data: data2 });
    await pull({ remote, data: data1 });
    const project2 = get(fs);
    expect(project2.archived).toBe(true);
    expect(project1.last_edited).toEqual(project2.last_edited);
  });

  it("dearchives, does sync, then sees the other gets dearchived; this just tests that sync de-archives, but works even if there are no new snapshots", async () => {
    const fs = { project_id: "00000000-0000-0000-0000-000000000001" };
    setContext({ data: data1 });
    await dearchiveFilesystem(fs);
    const project1 = get(fs);
    expect(project1.archived).toBe(false);

    setContext({ data: data2 });
    await pull({ remote, data: data1 });
    const project2 = get(fs);
    expect(project2.archived).toBe(false);
  });

  it("archives project, does sync, de-archives project, adds another snapshot, then does sync, thus testing that sync both de-archives *and* pulls latest snapshot", async () => {
    const fs = { project_id: "00000000-0000-0000-0000-000000000001" };
    setContext({ data: data1 });
    expect(get(fs).archived).toBe(false);
    await archiveFilesystem(fs);
    expect(get(fs).archived).toBe(true);
    setContext({ data: data2 });
    await pull({ remote, data: data1 });
    expect(get(fs).archived).toBe(true);

    // now dearchive
    setContext({ data: data1 });
    await dearchiveFilesystem(fs);
    // write content
    await writeFile(join(filesystemMountpoint(fs), "d.txt"), "hello");
    // snapshot
    await createSnapshot({ ...fs, force: true });
    const project1 = get(fs);

    setContext({ data: data2 });
    await pull({ remote, data: data1 });
    const project2 = get(fs);
    expect(project2.snapshots).toEqual(project1.snapshots);
    expect(project2.archived).toBe(false);
  });

  it("deletes project, does sync, then sees the other does NOT gets deleted without passing the deleteFilesystemCutoff option, and also with deleteFilesystemCutoff an hour ago, but does get deleted with it now", async () => {
    const fs = { project_id: "00000000-0000-0000-0000-000000000001" };
    setContext({ data: data1 });
    expect(await filesystemExists(fs)).toEqual(true);
    await deleteFilesystem(fs);
    expect(await filesystemExists(fs)).toEqual(false);

    setContext({ data: data2 });
    expect(await filesystemExists(fs)).toEqual(true);
    await pull({ remote, data: data1 });
    expect(await filesystemExists(fs)).toEqual(true);

    await pull({
      remote,
      data: data1,
      deleteFilesystemCutoff: new Date(Date.now() - 1000 * 60 * 60),
    });
    expect(await filesystemExists(fs)).toEqual(true);

    await pull({
      remote,
      data: data1,
      deleteFilesystemCutoff: new Date(),
    });
    expect(await filesystemExists(fs)).toEqual(false);
  });

  const v = [
    { project_id: "00000000-0000-0000-0000-000000000001", affinity: "math" },
    {
      account_id: "00000000-0000-0000-0000-000000000002",
      name: "cocalc",
      affinity: "math",
    },
    {
      group_id: "00000000-0000-0000-0000-000000000003",
      namespace: "test",
      name: "data",
      affinity: "sage",
    },
  ];
  it("creates 3 filesystems in 2 different namespaces, and confirms sync works", async () => {
    setContext({ data: data1 });
    for (const fs of v) {
      await createFilesystem(fs);
    }
    // write files to fs2 and fs3, so data will get sync'd too
    await writeFile(join(filesystemMountpoint(v[1]), "a.txt"), "hello");
    await writeFile(join(filesystemMountpoint(v[2]), "b.txt"), "cocalc");
    // snapshot
    await createSnapshot({ ...v[1], force: true });
    await createSnapshot({ ...v[2], force: true });
    const p = v.map((x) => get(x));

    // do the sync
    setContext({ data: data2 });
    await pull({ remote, data: data1 });

    // verify that we have everything
    for (const fs of v) {
      expect(await filesystemExists(fs)).toEqual(true);
    }
    const p2 = v.map((x) => get(x));
    for (let i = 0; i < p.length; i++) {
      // everything matches (even snapshots, since no trimming happened)
      for (const field of SYNCED_FIELDS) {
        expect({ i, field, value: p[i][field] }).toEqual({
          i,
          field,
          value: p2[i][field],
        });
      }
    }
  });

  it("edits some files on one of the above filesystems, snapshots, sync's, goes back and deletes a snapshot, edits more files, sync's, and notices that snapshots on sync target properly match snapshots on source.", async () => {
    // edits some files on one of the above filesystems, snapshots:
    setContext({ data: data1 });
    await writeFile(join(filesystemMountpoint(v[1]), "a2.txt"), "hello2");
    await createSnapshot({ ...v[1], force: true });

    // sync's
    setContext({ data: data2 });
    await pull({ remote, data: data1 });

    // delete snapshot
    setContext({ data: data1 });
    const fs1 = get(v[1]);
    await deleteSnapshot({ ...v[1], snapshot: fs1.snapshots[0] });

    // do more edits and make another snapshot
    await writeFile(join(filesystemMountpoint(v[1]), "a3.txt"), "hello3");
    await createSnapshot({ ...v[1], force: true });
    const snapshots1 = get(v[1]).snapshots;

    // sync
    setContext({ data: data2 });
    await pull({ remote, data: data1 });

    // snapshots do NOT initially match, since we didn't enable snapshot deleting!
    let snapshots2 = get(v[1]).snapshots;
    expect(snapshots1).not.toEqual(snapshots2);

    await pull({ remote, data: data1, deleteSnapshots: true });
    // now snapshots should match exactly!
    snapshots2 = get(v[1]).snapshots;
    expect(snapshots1).toEqual(snapshots2);
  });

  it("test directly pulling one filesystem, rather than doing a full sync", async () => {
    setContext({ data: data1 });
    await writeFile(join(filesystemMountpoint(v[1]), "a3.txt"), "hello2");
    await createSnapshot({ ...v[1], force: true });
    await writeFile(join(filesystemMountpoint(v[2]), "a4.txt"), "hello");
    await createSnapshot({ ...v[2], force: true });
    const p = v.map((x) => get(x));

    setContext({ data: data2 });
    await pull({ remote, data: data1, filesystem: v[1] });
    const p2 = v.map((x) => get(x));

    // now filesystem 1 should match, but not filesystem 2
    expect(p[1].snapshots).toEqual(p2[1].snapshots);
    expect(p[2].snapshots).not.toEqual(p2[2].snapshots);

    // finally a full sync will get filesystem 2
    await pull({ remote, data: data1 });
    const p2b = v.map((x) => get(x));
    expect(p[2].snapshots).toEqual(p2b[2].snapshots);
  });
});
