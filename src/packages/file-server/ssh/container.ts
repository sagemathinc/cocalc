/*
Manager container that is the target of ssh.

*/

import { execFile as execFile0 } from "node:child_process";
import { promisify } from "node:util";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";
import { build } from "./build-container";
import { getMutagenAgent } from "./mutagen";

const logger = getLogger("file-server:ssh:container");
const execFile = promisify(execFile0);

const Dockerfile = `
FROM docker.io/alpine:latest
RUN apk update && apk add --no-cache rsync
`;
const IMAGE = "localhost/file-server-ssh:v1";

function containerName(volume: string): string {
  return `file-server-ssh-${volume}`;
}

export const start = reuseInFlight(
  async ({
    volume,
    path,
    publicKey,
    ports,
    pids = 100,
    memory = "1G",
  }: {
    volume: string;
    path: string;
    publicKey: string;
    ports?: string;
    memory?: string;
    pids?: number;
  }) => {
    // make sure our ssh image is available
    await build({ name: IMAGE, Dockerfile });

    const cmd = "podman";
    const args = ["run"];
    // the container is named in a way that is determined by the volume name:
    const name = containerName(volume);
    args.push("--name", name);
    // mount the volume contents to the directory /root in the container.
    // Since user can write arbitrary files here, this is noexec, so they
    // can't somehow run them.
    args.push("-v", `${path}:/root:noexec`);
    // /root/.mutagen-dev is mutagen's scratch space; it's an
    // in-memory tmpfs where you can't run executables.
    args.push(
      "--mount",
      "type=tmpfs,tmpfs-size=16m,tmpfs-mode=0700,destination=/root/.mutagen-dev,noexec",
    );
    // The actual mutagen agent is preinstalled here and DOES have to
    // be executable, but VERY importantly it can't be changed from
    // within the container.
    const mutagen = await getMutagenAgent();
    args.push(
      "-v",
      `${mutagen.path}:/root/.mutagen-dev/agents/${mutagen.version}:ro`,
    );
    args.push(
      "-v",
      "/home/wstein/build/cocalc-lite/src/packages/file-server/ssh/ssh:/root/.ssh:ro",
    );
    args.push(
      "--mount",
      "type=tmpfs,tmpfs-size=2m,tmpfs-mode=0700,destination=/etc/dropbear,noexec",
    );
    args.push("--read-only");
    args.push(`--pids-limit=${pids}`);
    args.push(`--memory=${memory}`);
    args.push("--detach");
    args.push("-e", `PUBLIC_KEY=${publicKey}`);
    args.push("-p", "22");
    if (ports) {
      args.push("-p", ports);
    }
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
    logger.debug(sh);
    const { stdout, stderr } = await execFile(cmd, args);
    logger.debug("started ssh container", { volume, stdout, stderr });
  },
);

export async function getPorts({ volume }: { volume: string }) {
  const { stdout } = await execFile("podman", ["port", containerName(volume)]);
  const ports: { [port: number]: number } = {};
  for (const x of stdout.split("\n")) {
    if (x) {
      const i = x.indexOf("/");
      const j = x.lastIndexOf(":");
      if (i == -1 || j == -1) continue;
      ports[parseInt(x.slice(0, i))] = parseInt(x.slice(j + 1));
    }
  }
  return ports;
}

export async function stop({ volume }: { volume: string }) {
  await execFile("podman", ["rm", "-f", "-t", "0", containerName(volume)]);
}
