import { fork, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:conat:persist");

const children = new Map<string, ChildProcess>();
let shuttingDown = false;

export function createForkedPersistServer(id: string) {
  logger.debug("createForkedPersistServer", { id });
  const child = fork(join(__dirname, "start-persist-node.js"), [], {
    env: { ...process.env, PERSIST_SERVER_ID: id },
  });
  children.set(id, child);

  child.on("exit", (code, signal) => {
    children.delete(id);

    if (shuttingDown) return; // we're intentionally stopping everything

    logger.debug(
      `WARNING: Persist server [${id}] exited (code=${code}, signal=${signal}), restarting shortly...`,
    );

    setTimeout(() => {
      createForkedPersistServer(id);
    }, 2000); // restart after 2 seconds
  });

  return child;
}

function close() {
  shuttingDown = true;
  for (const child of children.values()) {
    // Avoid SIGKILL; allow proper sqlite shutdown
    child.kill("SIGTERM");
  }
  children.clear();
}

process.once("exit", close);

["SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    shuttingDown = true;
    for (const child of children.values()) {
      child.kill(sig as NodeJS.Signals);
    }
  });
});
