export interface AcpExecutor {
  getMountPoint?: () => string;
  readTextFile(relativePath: string): Promise<string>;
  writeTextFile(relativePath: string, content: string): Promise<void>;
  exec(
    cmd: string,
    opts?: { cwd?: string; timeoutMs?: number; env?: Record<string, string> },
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal?: string;
  }>;
}

export { ContainerExecutor } from "./container";
export { LocalExecutor } from "./local";
