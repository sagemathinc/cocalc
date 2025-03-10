/*
DEVELOPMENT:

pnpm exec jest --watch create.test.ts

 pnpm exec jest create.test.ts -b
*/

// application/typescript text
import { executeCode } from "@cocalc/backend/execute-code";
import { createTestPools, deleteTestPools, init, describe, describe0 } from "./util";
import {
  createFilesystem,
  createBackup,
  deleteFilesystem,
  getPools,
} from "@cocalc/file-server/zfs";
import { filesystemMountpoint } from "@cocalc/file-server/zfs/names";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { uuid } from "@cocalc/util/misc";
import { map as asyncMap } from "awaiting";

describe0("test for zfs", () => {
  it("checks for TEST_ZFS", () => {
    if (!process.env.TEST_ZFS) {
      // make sure people aren't silently overconfident...
      console.log(
        "WARNing: TEST_ZFS not set, so **SKIPPING ALL ZFS FILE SERVER TESTS!**",
      );
    }
  });
});

describe("creates project, clone project, delete projects", () => {
  let x: any = null;

  beforeAll(async () => {
    x = await createTestPools({ count: 1, size: "1G" });
    await init();
  });

  afterAll(async () => {
    if (x != null) {
      await deleteTestPools(x);
    }
  });

  it("verifies there is a pool", async () => {
    const { stdout } = await executeCode({
      command: "zpool",
      args: ["list", x.pools[0]],
    });
    expect(stdout).toContain(x.pools[0]);
    expect(Object.keys(await getPools()).length).toBe(1);
  });

  const project_id = "00000000-0000-0000-0000-000000000001";
  it("creates a project", async () => {
    const project = await createFilesystem({
      project_id,
    });
    expect(project.owner_id).toBe(project_id);
  });

  it("verify project is in output of zfs list", async () => {
    const { stdout } = await executeCode({
      command: "zfs",
      args: ["list", "-r", x.pools[0]],
    });
    expect(stdout).toContain(project_id);
  });

  const FILE_CONTENT = "hello";
  const FILENAME = "cocalc.txt";
  it("write a file to the project", async () => {
    const path = join(
      filesystemMountpoint({ project_id, namespace: "default" }),
      FILENAME,
    );
    await writeFile(path, FILE_CONTENT);
  });

  const project_id2 = "00000000-0000-0000-0000-000000000002";
  it("clones our project to make a second project", async () => {
    const project2 = await createFilesystem({
      project_id: project_id2,
      clone: { project_id },
    });
    expect(project2.owner_id).toBe(project_id2);
  });

  it("verify clone is in output of zfs list", async () => {
    const { stdout } = await executeCode({
      command: "zfs",
      args: ["list", "-r", x.pools[0]],
    });
    expect(stdout).toContain(project_id2);
  });

  it("read file from the clone", async () => {
    const path = join(
      filesystemMountpoint({ project_id: project_id2, namespace: "default" }),
      FILENAME,
    );
    const content = (await readFile(path)).toString();
    expect(content).toEqual(FILE_CONTENT);
  });

  let BUP_DIR;
  it("make a  backup of project, so can see that it gets deleted below", async () => {
    const x = await createBackup({ project_id });
    BUP_DIR = x.BUP_DIR;
    expect(await exists(BUP_DIR)).toBe(true);
  });

  it("attempt to delete first project and get error", async () => {
    try {
      await deleteFilesystem({ project_id });
      throw Error("must throw");
    } catch (err) {
      expect(`${err}`).toContain("filesystem has dependent clones");
    }
  });

  it("delete second project, then first project, works", async () => {
    await deleteFilesystem({ project_id: project_id2 });
    await deleteFilesystem({ project_id });
    const { stdout } = await executeCode({
      command: "zfs",
      args: ["list", "-r", x.pools[0]],
    });
    expect(stdout).not.toContain(project_id);
    expect(stdout).not.toContain(project_id2);
  });

  it("verifies bup backup is also gone", async () => {
    expect(await exists(BUP_DIR)).toBe(false);
  });
});

describe("create two projects with the same project_id at the same time, but in different namespaces", () => {
  let x: any = null;

  beforeAll(async () => {
    x = await createTestPools({ count: 2, size: "1G" });
    await init();
  });

  afterAll(async () => {
    if (x != null) {
      await deleteTestPools(x);
    }
  });

  it("there are TWO pools this time", async () => {
    expect(Object.keys(await getPools()).length).toBe(2);
  });

  const project_id = "00000000-0000-0000-0000-000000000001";
  it("creates two projects", async () => {
    const project = await createFilesystem({
      project_id,
      namespace: "default",
    });
    expect(project.owner_id).toBe(project_id);

    const project2 = await createFilesystem({
      project_id,
      namespace: "test",
    });
    expect(project2.owner_id).toBe(project_id);
    // they are on different pools
    expect(project.pool).not.toEqual(project2.pool);
  });

  it("two different entries in zfs list", async () => {
    const { stdout: stdout0 } = await executeCode({
      command: "zfs",
      args: ["list", "-r", x.pools[0]],
    });
    expect(stdout0).toContain(project_id);
    const { stdout: stdout1 } = await executeCode({
      command: "zfs",
      args: ["list", "-r", x.pools[1]],
    });
    expect(stdout1).toContain(project_id);
  });
});

describe("test the affinity property when creating projects", () => {
  let x: any = null;

  beforeAll(async () => {
    x = await createTestPools({ count: 2, size: "1G" });
    await init();
  });

  afterAll(async () => {
    if (x != null) {
      await deleteTestPools(x);
    }
  });

  const project_id = "00000000-0000-0000-0000-000000000001";
  const project_id2 = "00000000-0000-0000-0000-000000000002";
  const affinity = "math100";
  it("creates two projects with same afinity", async () => {
    const project = await createFilesystem({
      project_id,
      affinity,
    });
    expect(project.owner_id).toBe(project_id);

    const project2 = await createFilesystem({
      project_id: project_id2,
      affinity,
    });
    expect(project2.owner_id).toBe(project_id2);
    // they are on SAME pools, because of affinity
    expect(project.pool).toEqual(project2.pool);
  });
});

describe("do a stress/race condition test creating a larger number of projects on a larger number of pools", () => {
  let x: any = null;

  const count = 3;
  const nprojects = 25;

  beforeAll(async () => {
    x = await createTestPools({ count, size: "1G" });
    await init();
  });

  afterAll(async () => {
    if (x != null) {
      await deleteTestPools(x);
    }
  });

  it(`creates ${nprojects} projects in parallel on ${count} pools`, async () => {
    const f = async (project_id) => {
      await createFilesystem({ project_id });
    };
    const v: string[] = [];
    for (let n = 0; n < nprojects; n++) {
      v.push(uuid());
    }
    // doing these in parallel and having it work is an important stress test,
    // since we will get a bid speedup doing this in production, and there we
    // will really need it.
    await asyncMap(v, nprojects, f);
  });
});
