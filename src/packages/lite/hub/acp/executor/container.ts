// Container executor scaffold for multiuser (podman) mode.
// This will wrap project-scoped conat APIs to run commands and read/write files
// inside a project container. All methods are placeholders to be filled in when
// wiring the actual project conat client.

export interface ContainerExecutorOptions {
  projectId: string;
  workspaceRoot: string;
  conatClient: unknown; // future: typed project conat client
  env?: Record<string, string>;
}

export class ContainerExecutor {
  constructor(private readonly options: ContainerExecutorOptions) {}

  // Read a project file relative to the project root/workspaceRoot.
  async readTextFile(_relativePath: string): Promise<string> {
    throw new Error("ContainerExecutor.readTextFile not implemented");
  }

  // Write a project file relative to the project root/workspaceRoot.
  async writeTextFile(_relativePath: string, _content: string): Promise<void> {
    throw new Error("ContainerExecutor.writeTextFile not implemented");
  }

  // Run a command inside the project container (non-interactive by default).
  async exec(_cmd: string, _opts?: { cwd?: string; timeoutMs?: number }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal?: string;
  }> {
    throw new Error("ContainerExecutor.exec not implemented");
  }
}
