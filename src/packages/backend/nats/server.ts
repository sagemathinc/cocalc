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

export function main({
  verbose,
  daemon,
}: { verbose?: boolean; daemon?: boolean } = {}) {
  let { command, args, env } = params();
  if (verbose) {
    args = [...args, "-DV"];
  }
  let opts;
  if (daemon) {
    opts = { ...env, detached: true, stdio: "ignore" };
    const child = spawn(command, args, opts);
    child.on("error", (err) => {
      throw Error(`Failed to start process: ${err}`);
    });

    if (daemon) {
      console.log(`Process started as daemon with PID: ${child.pid}`);
      child.unref();
    }
  } else {
    opts = { ...env, stdio: "inherit" };
    spawnSync(command, args, opts);
  }
}
