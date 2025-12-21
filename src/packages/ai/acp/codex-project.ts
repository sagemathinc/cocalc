import type { ChildProcess } from "node:child_process";

export type CodexProjectSpawnOptions = {
  projectId: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export type CodexProjectSpawner = {
  spawnCodexExec: (opts: CodexProjectSpawnOptions) => Promise<{
    proc: ChildProcess;
    cmd: string;
    args: string[];
    cwd?: string;
  }>;
};

let codexProjectSpawner: CodexProjectSpawner | null = null;

export function setCodexProjectSpawner(
  spawner: CodexProjectSpawner | null,
): void {
  codexProjectSpawner = spawner;
}

export function getCodexProjectSpawner(): CodexProjectSpawner | null {
  return codexProjectSpawner;
}
