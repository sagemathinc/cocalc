/*
Manager container that is the target of ssh.
*/

import { spawn, execFile as execFile0 } from "node:child_process";
import { promisify } from "node:util";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";
import { build } from "./build-container";
import { getMutagenAgent } from "./mutagen";
import { getDropbearServer } from "./dropbear";
import { until } from "@cocalc/util/async-utils";
import { delay } from "awaiting";
//import { once } from "@cocalc/util/async-utils";

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

const children: { [volume: string]: any } = {};

export const start = reuseInFlight(
  async ({
    volume,
    path,
    publicKey,
    authorizedKeys,
    ports,
    pids = 200,
    memory = "2G",
  }: {
    volume: string;
    path: string;
    publicKey: string;
    authorizedKeys: string;
    ports?: string;
    memory?: string;
    pids?: number;
  }): Promise<{ sshPort: number }> => {
    let child = children[volume];
    if (child != null && child.exitCode == null) {
      console.log("already running", {
        publicKey,
        curPublicKey: child.publicKey,
      });
      // already running
      if (
        child.publicKey != publicKey ||
        child.authorizedKeys != authorizedKeys
      ) {
        // rebuild if for some reason they project's key is changed
        await stop({ volume });
      } else {
        return { sshPort: children[volume].sshPort };
      }
    }

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
    const mutagen = await getMutagenAgent();
    args.push(
      "-v",
      `${mutagen.path}:/root/.mutagen-dev/agents/${mutagen.version}:ro`,
    );
    const dropbear = await getDropbearServer({ publicKey });
    args.push("-v", `${dropbear}:/root/.ssh:ro`);
    args.push(
      "--mount",
      "type=tmpfs,tmpfs-size=1m,tmpfs-mode=0700,destination=/etc/dropbear,noexec",
    );
    args.push("--read-only");
    args.push(`--pids-limit=${pids}`);
    args.push(`--memory=${memory}`);
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
    child = spawn(cmd, args);
    children[volume] = child;
    // @ts-ignore
    child.publicKey = publicKey;
    child.authorizedKeys = authorizedKeys;
    logger.debug("started ssh container", { volume, pid: child.pid });
    // there will be output when ssh server starts
    //await once(child.stderr, "data", 3000);
    await delay(50);
    const start = Date.now();
    await until(
      async () => {
        if (Date.now() - start >= 5000) {
          throw Error("unable to determine port");
        }
        try {
          if (children[volume] == null || children[volume].exitCode != null) {
            return true;
          }
          const ports = await getPorts({ volume });
          console.log("got ports", ports);
          if (ports[22]) {
            // @ts-ignore
            child.sshPort = ports[22];
            return true;
          }
        } catch {
          console.log("got ports error");
        }
        return false;
      },
      { min: 100 },
    );
    // @ts-ignore
    return { sshPort: child.sshPort };
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
  const child = children[volume];
  if (child == null) return;

  delete children[volume];
  if (child.exitCode == null) {
    try {
      logger.debug("stopping", { volume });
      await execFile("podman", ["rm", "-f", "-t", "0", containerName(volume)]);
    } catch (err) {
      logger.debug("stop", { volume, err });
    }
  }
}

export async function close() {
  const v: any[] = [];
  for (const volume in children) {
    logger.debug("stopping", { volume });
    v.push(stop({ volume }));
  }
  await Promise.all(v);
}

// important because it kills all
// the processes that were spawned
process.once("exit", close);
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    process.exit();
  });
});
