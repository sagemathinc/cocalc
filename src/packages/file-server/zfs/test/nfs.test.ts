/*
DEVELOPMENT:

pnpm exec jest --watch nfs.test.ts
*/

import { executeCode } from "@cocalc/backend/execute-code";
import {
  createTestPools,
  deleteTestPools,
  restartNfsServer,
  init,
  describe,
} from "./util";
import {
  createFilesystem,
  createSnapshot,
  get,
  shareNFS,
  unshareNFS,
} from "@cocalc/file-server/zfs";
import { filesystemMountpoint } from "@cocalc/file-server/zfs/names";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

describe("create a project, put in a files, snapshot, another file, then share via NFS, mount and verify it works", () => {
  let x: any = null;
  const project_id = "00000000-0000-0000-0000-000000000001";
  let nsfMnt = "";

  beforeAll(async () => {
    x = await createTestPools({ count: 1, size: "1G" });
    nsfMnt = join(x.tempDir, project_id);
    await init();
  });

  afterAll(async () => {
    if (x != null) {
      await deleteTestPools(x);
    }
  });

  const mnt = filesystemMountpoint({ project_id, namespace: "default" });
  const FILE_CONTENT = "hello";
  const FILENAME = "cocalc.txt";
  it("creates a project and write a file", async () => {
    const project = await createFilesystem({
      project_id,
    });
    expect(project.owner_id).toBe(project_id);
    const path = join(mnt, FILENAME);
    await writeFile(path, FILE_CONTENT);
  });

  let snapshot1, snapshot2;
  const FILE_CONTENT2 = "hello2";
  const FILENAME2 = "cocalc2.txt";

  it("create a snapshot and write another file, so there is a nontrivial snapshot to view through NFS", async () => {
    snapshot1 = await createSnapshot({ project_id });
    expect(!!snapshot1).toBe(true);
    const path = join(mnt, FILENAME2);
    await writeFile(path, FILE_CONTENT2);
    snapshot2 = await createSnapshot({ project_id, force: true });
    expect(snapshot2).not.toEqual(snapshot1);
  });

  let host = "";
  const client = "127.0.0.1";

  const mount = async () => {
    await executeCode({
      command: "sudo",
      args: ["mkdir", "-p", nsfMnt],
    });
    await executeCode({
      command: "sudo",
      args: ["mount", host, nsfMnt],
    });
  };

  it("shares the project via NFS, and mounts it", async () => {
    host = await shareNFS({ project_id, client });
    const project = get({ project_id });
    expect(project.nfs).toEqual([client]);
    await mount();
  });

  it("confirms our files and snapshots are there as expected", async () => {
    const { stdout } = await executeCode({
      command: "sudo",
      args: ["ls", nsfMnt],
    });
    expect(stdout).toContain(FILENAME);
    expect(stdout).toContain(FILENAME2);
    expect((await readFile(join(nsfMnt, FILENAME))).toString()).toEqual(
      FILE_CONTENT,
    );
    expect((await readFile(join(nsfMnt, FILENAME2))).toString()).toEqual(
      FILE_CONTENT2,
    );
  });

  it("stop NFS share and confirms it no longers works", async () => {
    await executeCode({
      command: "sudo",
      args: ["umount", nsfMnt],
    });
    await restartNfsServer();
    await unshareNFS({ project_id, client });
    try {
      await mount();
      throw Error("bug -- mount should fail");
    } catch (err) {
      expect(`${err}`).toMatch(/not permitted|denied/);
    }
  });
});
