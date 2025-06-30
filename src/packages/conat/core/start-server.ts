import { type Options } from "./server";
import { fork, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const children: ChildProcess[] = [];
export function forkedConatServer(opts: Options) {
  // this is fragile:
  const child: ChildProcess = fork(
    join(
      __dirname,
      "..",
      "..",
      "..",
      "server",
      "dist",
      "conat",
      "socketio",
      "start-cluster-node.js",
    ),
  );
  children.push(child);
  child.send(opts);
}

function close() {
  children.map((child) => child.kill("SIGKILL"));
}

process.once("exit", () => {
  close();
});

["SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    children.map((child) => child.kill(sig as any));
  });
});
