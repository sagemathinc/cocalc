import { nats } from "@cocalc/backend/data";
import { join } from "path";
import { spawn } from "node:child_process";

export function startServer(): number {
  const { pid } = spawn(
    join(nats, "bin", "nats-server"),
    ["-c", join(nats, "server.conf")],
    { cwd: nats },
  );
  if (pid == null) {
    throw Error("issue spawning nats-server");
  }
  return pid;
}
