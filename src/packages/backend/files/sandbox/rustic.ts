import exec, { type ExecOutput /*, validate*/ } from "./exec";
import { rustic as rusticPath } from "./install";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { join } from "path";

export interface RusticOptions {
  repo: string;
  timeout?: number;
  maxSize?: number;
  safeAbsPath?: (path: string) => Promise<string>;
}

export default async function rustic(
  args: string[],
  options: RusticOptions,
): Promise<ExecOutput> {
  const { timeout, maxSize, repo, safeAbsPath } = options;

  await ensureInitialized(repo);

  return await exec({
    cmd: rusticPath,
    cwd: safeAbsPath ? await safeAbsPath("") : undefined,
    safety: ["--password", "", "-r", repo, ...args],
    maxSize,
    timeout,
  });
}

async function ensureInitialized(repo: string) {
  if (!(await exists(join(repo, "config")))) {
    await exec({
      cmd: rusticPath,
      safety: ["--password", "", "-r", repo, "init"],
    });
  }
}

// const whitelist = {
//   backup: {},
//   restore: {},
//   snapshots: {},
// } as const;
