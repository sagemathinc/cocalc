import { ContainerExecutor } from "../container";

function makeMockApi() {
  const readTextFileFromProject = jest.fn().mockResolvedValue("data");
  const writeTextFileToProject = jest.fn().mockResolvedValue(undefined);
  const exec = jest.fn().mockResolvedValue({
    stdout: "out",
    stderr: "err",
    exit_code: 0,
  });
  const api: any = {
    system: {
      readTextFileFromProject,
      writeTextFileToProject,
      exec,
    },
  };
  return { api, readTextFileFromProject, writeTextFileToProject, exec };
}

describe("ContainerExecutor", () => {
  const projectId = "00000000-0000-4000-8000-000000000000";
  const workspaceRoot = "/projects/test/";

  it("reads and writes within workspace", async () => {
    const { api, readTextFileFromProject, writeTextFileToProject } =
      makeMockApi();
    const exec = new ContainerExecutor({
      projectId,
      workspaceRoot,
      projectApi: api as any,
    });

    await expect(exec.readTextFile("sub/file.txt")).resolves.toBe("data");
    expect(readTextFileFromProject).toHaveBeenCalledWith({
      path: "/projects/test/sub/file.txt",
    });

    await exec.writeTextFile("sub/file.txt", "hello");
    expect(writeTextFileToProject).toHaveBeenCalledWith({
      path: "/projects/test/sub/file.txt",
      content: "hello",
    });
  });

  it("prevents path escape", async () => {
    const { api } = makeMockApi();
    const exec = new ContainerExecutor({
      projectId,
      workspaceRoot,
      projectApi: api as any,
    });
    await expect(exec.readTextFile("../outside")).rejects.toThrow(
      /escapes workspace/i,
    );
  });

  it("executes commands with cwd/env/timeout", async () => {
    const { api, exec: execFn } = makeMockApi();
    const executor = new ContainerExecutor({
      projectId,
      workspaceRoot,
      projectApi: api as any,
      env: { BASE: "1" },
    });
    const result = await executor.exec("echo hi", {
      cwd: "subdir",
      timeoutMs: 1200,
      env: { EXTRA: "yes" },
    });
    expect(result).toEqual({
      stdout: "out",
      stderr: "err",
      exitCode: 0,
      signal: undefined,
    });
    expect(execFn).toHaveBeenCalledWith({
      command: "echo hi",
      bash: true,
      cwd: "/projects/test/subdir",
      timeout: 2,
      env: { BASE: "1", EXTRA: "yes" },
      err_on_exit: false,
    });
  });
});
