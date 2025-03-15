import { nats } from "@cocalc/backend/data";
import { join } from "path";
import { spawn, spawnSync } from "node:child_process";

function params() {
  return {
    command: join(nats, "bin", "nats-server"),
    args: ["-c", join(nats, "server.conf")],
    env: { cwd: nats },
  };
}

export function startServer(): number {
  const { command, args, env } = params();
  const { pid } = spawn(command, args, env);
  if (pid == null) {
    throw Error("issue spawning nats-server");
  }
  return pid;
}

export function main({ verbose }: { verbose?: boolean } = {}) {
  let { command, args, env } = params();
  if (verbose) {
    args = [...args, "-DV"];
  }
  spawnSync(command, args, { ...env, stdio: "inherit" });
}
