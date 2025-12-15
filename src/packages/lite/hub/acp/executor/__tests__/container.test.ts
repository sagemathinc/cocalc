import { execFile } from "node:child_process";
import {
  ContainerExecutor,
  setContainerFileIO,
} from "../container";

jest.mock("node:child_process", () => {
  const execFileMock = jest.fn();
  return { execFile: execFileMock };
});

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
    });
    const exec = new ContainerExecutor({
      projectId,
      workspaceRoot,
      projectApi: api as any,
    });
    await expect(exec.readTextFile("foo.txt")).resolves.toBe("native");
    expect(reader).toHaveBeenCalledWith(projectId, "/projects/test/foo.txt");
    await exec.writeTextFile("bar.txt", "ok");
    expect(writer).toHaveBeenCalledWith(projectId, "/projects/test/bar.txt", "ok");
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
    const { api } = makeMockApi();
    const executor = new ContainerExecutor({
      projectId,
      workspaceRoot,
      projectApi: api as any,
      env: { BASE: "1" },
    });
    (execFile as unknown as jest.Mock).mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        cb: (...args: any[]) => void,
      ) => {
        cb(null, "out", "err");
        return null as any;
      },
    );
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
    expect(execFile).toHaveBeenCalledWith(
      "podman",
      expect.arrayContaining([
        "exec",
        "-i",
        "--workdir",
        "/projects/test/subdir",
        "--env",
        "BASE=1",
        "--env",
        "EXTRA=yes",
        `project-${projectId}`,
        "bash",
        "-lc",
        "echo hi",
      ]),
      expect.objectContaining({ timeout: 1200, maxBuffer: expect.any(Number) }),
      expect.any(Function),
    );
  });
});
