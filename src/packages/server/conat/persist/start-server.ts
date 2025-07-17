import { fork, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const children: ChildProcess[] = [];
export function createForkedPersistServer() {
  const child: ChildProcess = fork(join(__dirname, "start-persist-node.js"));
  children.push(child);
}

function close() {
  // We do NOT send SIGKILL here, since we very much want the processes to
  // have a proper clean shutdown, so no data from the sqlite databases they
  // are managing gets lost.
  children.map((child) => child.kill("SIGTERM"));
}

process.once("exit", () => {
  close();
});

["SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    children.map((child) => child.kill(sig as any));
  });
});
