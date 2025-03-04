/*
DEVELOPMENT:

pnpm exec jest --watch archive.test.ts
*/

import { executeCode } from "@cocalc/backend/execute-code";
import { createTestPools, deleteTestPools, init, describe } from "./util";
import {
  archiveProject,
  dearchiveProject,
  createProject,
  createSnapshot,
  getSnapshots,
  get,
} from "@cocalc/file-server/zfs";
import { projectMountpoint } from "@cocalc/file-server/zfs/names";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { exists } from "@cocalc/backend/misc/async-utils-node";

describe("create a project, put in some files/snapshot, archive the project, confirm gone, de-archive it, and confirm files are back as expected", () => {
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

  const project_id = "00000000-0000-0000-0000-000000000001";
  const mnt = projectMountpoint({ project_id, namespace: "default" });
  const FILE_CONTENT = "hello";
  const FILENAME = "cocalc.txt";
  it("creates a project and write a file", async () => {
    const project = await createProject({
      project_id,
    });
    expect(project.project_id).toBe(project_id);
    const path = join(mnt, FILENAME);
    await writeFile(path, FILE_CONTENT);
  });

  let snapshot1, snapshot2;
  const FILE_CONTENT2 = "hello2";
  const FILENAME2 = "cocalc2.txt";

  it("create a snapshot and write another file, so there is a nontrivial snapshot to be archived", async () => {
    snapshot1 = await createSnapshot({ project_id });
    expect(!!snapshot1).toBe(true);
    const path = join(mnt, FILENAME2);
    await writeFile(path, FILE_CONTENT2);
    snapshot2 = await createSnapshot({ project_id, force: true });
    expect(snapshot2).not.toEqual(snapshot1);
  });

  it("archive the project and checks project is no longer in zfs at all", async () => {
    expect(get({ project_id }).archived).toBe(false);
    await archiveProject({ project_id });
    const { stdout } = await executeCode({
      command: "zfs",
      args: ["list", x.pools[0]],
    });
    expect(stdout).not.toContain(project_id);
    expect(await exists(mnt)).toBe(false);
    expect(get({ project_id }).archived).toBe(true);
  });

  it("archiving an already archived project is an error", async () => {
    await expect(
      async () => await archiveProject({ project_id }),
    ).rejects.toThrow();
  });

  it("dearchive project and verify zfs filesystem is back, along with files and snapshots", async () => {
    let called = false;
    await dearchiveProject({
      project_id,
      progress: () => {
        called = true;
      },
    });
    expect(called).toBe(true);
    expect(get({ project_id }).archived).toBe(false);

    expect((await readFile(join(mnt, FILENAME))).toString()).toEqual(
      FILE_CONTENT,
    );
    expect((await readFile(join(mnt, FILENAME2))).toString()).toEqual(
      FILE_CONTENT2,
    );
    expect(await getSnapshots({ project_id })).toEqual([snapshot1, snapshot2]);
  });

  it("dearchiving an already de-archived project is an error", async () => {
    await expect(
      async () => await dearchiveProject({ project_id }),
    ).rejects.toThrow();
  });
});
