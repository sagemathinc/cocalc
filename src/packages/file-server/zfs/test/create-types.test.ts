/*
DEVELOPMENT:

pnpm exec jest --watch create-types.test.ts
*/

import { createTestPools, deleteTestPools, init, describe } from "./util";
import {
  createFilesystem,
} from "@cocalc/file-server/zfs";
import type { Filesystem } from "../types";

describe("create some account and organization filesystems", () => {
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

  // Making these the same intentionally to ensure the filesystem properly
  // does not distinguish types based on the owner_id.
  const project_id = "00000000-0000-0000-0000-000000000001";
  const account_id = "00000000-0000-0000-0000-000000000001";
  const group_id = "00000000-0000-0000-0000-000000000001";
  const filesystems: Filesystem[] = [];
  it("creates filesystems associated to the project, account and group", async () => {
    const fs = await createFilesystem({ project_id });
    expect(fs.owner_id).toBe(project_id);
    filesystems.push(fs);
    const fs2 = await createFilesystem({ account_id, name: "cocalc" });
    expect(fs2.owner_id).toBe(account_id);
    filesystems.push(fs2);
    const fs3 = await createFilesystem({ group_id, name: "data" });
    expect(fs3.owner_id).toBe(group_id);
    filesystems.push(fs3);
  });

  it("tries to create an account and group filesystem with empty name and gets an error", async () => {
    expect(async () => {
      await createFilesystem({ account_id });
    }).rejects.toThrow("name must be nonempty");
    expect(async () => {
      await createFilesystem({ group_id });
    }).rejects.toThrow("name must be nonempty");
  });

  it('for projects the name defaults to "home"', async () => {
    expect(async () => {
      await createFilesystem({ project_id, name: "" });
    }).rejects.toThrow("must be nonempty");
    expect(filesystems[0].name).toBe("home");
  });

  it("name must be less than 64 characters", async () => {
    let name = "";
    for (let i = 0; i < 63; i++) {
      name += "x";
    }
    await createFilesystem({ account_id, name });
    name += 1;
    expect(async () => {
      await createFilesystem({ account_id, name });
    }).rejects.toThrow("name must be at most 63 characters");
  });

  it("name must not have 'funny characters'", async () => {
    expect(async () => {
      await createFilesystem({ account_id, name: "$%@!" });
    }).rejects.toThrow("name must only contain");
  });
});
