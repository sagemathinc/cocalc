/*
DEVELOPMENT:

pnpm exec jest --watch --forceExit --detectOpenHandles "create.test.ts"
*/

// application/typescript text
import { executeCode } from "@cocalc/backend/execute-code";
import { createTestPools, deleteTestPools, initDb } from "./util";
import { createProject } from "@cocalc/file-server/zfs";

describe("creates a testing pool and a project in it", () => {
  let x: any = null;

  beforeAll(async () => {
    x = await createTestPools({ count: 1, size: "1G" });
    await initDb();
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
  });

  const project_id = "00000000-0000-0000-0000-000000000001";
  it("creates a project", async () => {
    const project = await createProject({
      project_id,
    });
    expect(project.project_id).toBe(project_id);
  });

  it("verify project is in output of zfs list", async () => {
    const { stdout } = await executeCode({
      command: "zfs",
      args: ["list", "-r", x.pools[0]],
    });
    expect(stdout).toContain(project_id);
  });
});
