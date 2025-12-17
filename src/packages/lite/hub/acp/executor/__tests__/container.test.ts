import {
  ContainerExecutor,
  setContainerExec,
  setContainerFileIO,
} from "../container";

function makeMockApi() {
  const readTextFileFromProject = jest.fn().mockResolvedValue("data");
  const writeTextFileToProject = jest.fn().mockResolvedValue(undefined);
  const api: any = {
    system: {
      readTextFileFromProject,
      writeTextFileToProject,
    },
  };
  return { api, readTextFileFromProject, writeTextFileToProject };
}

describe("ContainerExecutor", () => {
  const projectId = "00000000-0000-4000-8000-000000000000";
  const workspaceRoot = "/projects/test/";
  afterEach(() => {
    setContainerFileIO(null);
    setContainerExec(null);
  });

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

  it("uses injected file IO when provided", async () => {
    const { api } = makeMockApi();
    const reader = jest.fn().mockResolvedValue("native");
    const writer = jest.fn().mockResolvedValue(undefined);
    setContainerFileIO({
      readFile: reader,
      writeFile: writer,
      mountPoint: (projectId: string) => `/projects/${projectId}`,
    });
    const exec = new ContainerExecutor({
      projectId,
      workspaceRoot,
      projectApi: api as any,
    });
    await expect(exec.readTextFile("foo.txt")).resolves.toBe("native");
    expect(reader).toHaveBeenCalledWith(projectId, "/projects/test/foo.txt");
    await exec.writeTextFile("bar.txt", "ok");
    expect(writer).toHaveBeenCalledWith(
      projectId,
      "/projects/test/bar.txt",
      "ok",
    );
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

  it("executes commands with cwd/timeout", async () => {
    const { api } = makeMockApi();
    setContainerExec(async ({ script, cwd, timeoutMs }) => {
      expect(script).toBe("echo hi");
      expect(cwd).toBe("subdir");
      expect(timeoutMs).toBe(1200);
      return { stdout: "out", stderr: "err", code: 0 };
    });
    const executor = new ContainerExecutor({
      projectId,
      workspaceRoot,
      projectApi: api as any,
    });
    const result = await executor.exec("echo hi", {
      cwd: "subdir",
      timeoutMs: 1200,
    });
    expect(result).toEqual({
      stdout: "out",
      stderr: "err",
      exitCode: 0,
      signal: undefined,
    });
  });

  it("unwraps existing bash -lc to avoid double shell", async () => {
    const { api } = makeMockApi();
    setContainerExec(async ({ script }) => {
      expect(script).toBe("apt-get update");
      return { stdout: "", stderr: "", code: 0 };
    });
    const executor = new ContainerExecutor({
      projectId,
      workspaceRoot,
      projectApi: api as any,
    });
    await executor.exec("/bin/bash -lc apt-get update");
  });
});
