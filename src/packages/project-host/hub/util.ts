import { spawn } from "node:child_process";
import { argsJoin } from "@cocalc/util/args";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Run a child process, logging the command and propagating stderr on failure.
export async function runCmd(
  logger: any,
  cmd: string,
  args: string[],
  opts: any = {},
) {
  const MAX_STDERR = 1_000_000; // cap to avoid unbounded buffer and RangeError
  return await new Promise<void>((resolve, reject) => {
    logger.debug(`runCmd: ${cmd} ${argsJoin(args)}`);
    const child = spawn(cmd, args, opts);
    let stderr = "";
    let truncated = false;
    child.stderr?.on("data", (d) => {
      if (truncated) return;
      const chunk = d.toString();
      if (stderr.length + chunk.length > MAX_STDERR) {
        stderr += chunk.slice(0, MAX_STDERR - stderr.length);
        truncated = true;
        logger?.debug?.("runCmd: stderr truncated", { cmd, args });
      } else {
        stderr += chunk;
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve();
      const suffix = truncated ? " [stderr truncated]" : "";
      reject(
        new Error(`${cmd} exited with code ${code}: ${stderr.trim()}${suffix}`),
      );
    });
  });
}

// Create temp SSH material (private key + known_hosts) with 0600 perms.
export async function setupSshTempFiles({
  prefix = "ph-ssh-",
  privateKey,
  knownHostsContent,
}: {
  prefix?: string;
  privateKey: string;
  knownHostsContent: string;
}) {
  const tmp = await mkdtemp(join(tmpdir(), prefix));
  const keyFile = join(tmp, "id_ed25519");
  const knownHosts = join(tmp, "known_hosts");
  await writeFile(keyFile, privateKey, { mode: 0o600 });
  await writeFile(knownHosts, knownHostsContent, { mode: 0o600 });
  const cleanup = async () => {
    await rm(tmp, { recursive: true, force: true });
  };
  return { tmp, keyFile, knownHosts, cleanup };
}
