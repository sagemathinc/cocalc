/*
Manager container that is the target of ssh.

*/

import { spawn } from "node:child_process";
const IMAGE = "localhost/alpine-rsync";

function containerName(volume: string): string {
  return `file-server-ssh-${volume}`;
}

export async function start({
  volume,
  path,
  publicKey = "none",
}: {
  volume: string;
  path: string;
  publicKey: string;
}) {
  const cmd = "podman";
  const args = ["run"];
  const name = containerName(volume);
  args.push("--name", name);
  args.push("-v", `${path}:/root:noexec`);
  args.push(
    "-v",
    "/home/wstein/build/cocalc-lite/src/packages/file-server/ssh/agent:/root/.mutagen-dev/agents/0.19.0-dev",
  );
  args.push(
    "-v",
    "/home/wstein/build/cocalc-lite/src/packages/file-server/ssh/ssh:/root/.ssh",
  );
  args.push(
    "--mount",
    "type=tmpfs,tmpfs-size=2m,tmpfs-mode=0700,destination=/etc/dropbear",
  );
  args.push("--read-only");
  args.push("-e", `PUBLIC_KEY=${publicKey}`);
  args.push("-p", "22");
  args.push("-p", "2000-2009");
  args.push(
    "--rm",
    IMAGE,
    "/root/.ssh/dropbear",
    "-m",
    "-F",
    "-E",
    "-R",
    "-g",
    "-a",
  );
  const sh = `${cmd} ${args.join(" ")}`;
  console.log(sh);
  const child = spawn(cmd, args);
  child.stderr.on("data", (chunk: Buffer) => {
    console.log(`${volume}.stderr: `, chunk.toString());
  });
}

export async function stop({ volume }: { volume: string }) {
  spawn("podman", ["rm", "-f", "-t", "0", containerName(volume)]);
}
