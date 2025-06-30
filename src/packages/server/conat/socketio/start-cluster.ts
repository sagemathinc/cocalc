import { spawn, ChildProcess } from "node:child_process";
import { join } from "path";
import { conatSocketioCount, conatClusterPort } from "@cocalc/backend/data";
import basePath from "@cocalc/backend/base-path";

const servers: { close: Function }[] = [];

export default function startCluster({
  port = conatClusterPort,
  numWorkers = conatSocketioCount,
}: { port?: number; numWorkers?: number } = {}) {
  const child: ChildProcess = spawn(
    process.argv[0],
    [join(__dirname, "cluster.js")],
    {
      stdio: "inherit",
      detached: false,
      cwd: __dirname,
      env: {
        ...process.env,
        PORT: `${port}`,
        CONAT_SOCKETIO_COUNT: `${numWorkers}`,
        BASE_PATH: basePath,
      },
    },
  );

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (!child?.pid) return;
    try {
      process.kill(child.pid, "SIGKILL");
    } catch {
      // already dead or not found
    }
  };

  const server = {
    close,
  };
  servers.push(server);
  return server;
}

process.once("exit", () => {
  for (const { close } of servers) {
    try {
      close();
    } catch {}
  }
});
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    process.exit();
  });
});
