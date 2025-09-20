/*
Manager container that is the target of ssh.


[ ] TODO: lock this down as follows (in user space) to block outgoing connections:

set -v

podman rm -t 0 -f sshbox

podman run -d --name sshbox   -p 127.0.0.1:36309:22/tcp  \
    --cap-drop ALL \
   --cap-add NET_BIND_SERVICE \
  --cap-add SYS_CHROOT \
  --cap-add SETGID \
  --cap-add SETUID \
  --security-opt seccomp=`pwd`/deny-connect.json \
  -v /home/wstein/scratch/projects/09144672-b427-448a-8ea3-8ec88b495443:/root \
  localhost/ssh sleep infinity

#

{
  "defaultAction": "SCMP_ACT_ALLOW",
  "archMap": [
    {
      "architecture": "SCMP_ARCH_X86_64",
      "subArchitectures": ["SCMP_ARCH_X86", "SCMP_ARCH_X32"]
    },
    {
      "architecture": "SCMP_ARCH_AARCH64",
      "subArchitectures": ["SCMP_ARCH_ARM"]
    }
  ],
  "syscalls": [{ "names": ["connect"], "action": "SCMP_ACT_ERRNO" }]
}


*/

import { spawn, execFile as execFile0 } from "node:child_process";
import { promisify } from "node:util";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";
import { build } from "@cocalc/backend/podman/build-container";
import { getMutagenAgent } from "./mutagen";
import { until } from "@cocalc/util/async-utils";
import { delay } from "awaiting";
import { k8sCpuParser } from "@cocalc/util/misc";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const logger = getLogger("file-server:ssh:container");
const execFile = promisify(execFile0);

const Dockerfile = `
FROM docker.io/ubuntu:25.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y ssh rsync
`;

const IMAGE = "localhost/core:0.1.0";

const sshd_conf = `
Port 22
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM no
PermitRootLogin yes
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/file-server/authorized_keys
AllowTcpForwarding no
GatewayPorts no
X11Forwarding no
X11UseLocalhost no
PermitTTY yes
Subsystem sftp internal-sftp
`;

function containerName(volume: string): string {
  return `file-server-${volume}`;
}

const children: { [volume: string]: any } = {};

export const start = reuseInFlight(
  async ({
    volume,
    path,
    publicKey,
    authorizedKeys,
    // TODO: think about limits once I've benchmarked
    pids = 100,
    // reality: mutagen potentially uses a lot of RAM of you have
    // a lot of files, and if it keeps crashing due to out of memory,
    // the project is completely broken, so for now:
    memory = "4000m",
    cpu = "1000m",
    lockdown = true,
  }: {
    volume: string;
    path: string;
    publicKey: string;
    authorizedKeys: string;
    memory?: string;
    cpu?: string;
    pids?: number;
    // can be nice to disable for dev and debugging
    lockdown?: boolean;
  }): Promise<{ sshPort: number }> => {
    let child = children[volume];
    if (child != null && child.exitCode == null) {
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
    await build({
      name: IMAGE,
      Dockerfile,
      files: { ["sshd.conf"]: sshd_conf },
    });

    const cmd = "podman";
    const args = ["run"];
    // the container is named in a way that is determined by the volume name:
    const name = containerName(volume);
    args.push("--name", name);

    // mount the volume contents to the directory /root in the container.
    // Since user can write arbitrary files here, this is noexec, so they
    // can't somehow run them.
    args.push("-v", `${path}:/root:noexec`);

    const sshPath = join(path, ".ssh", "file-server");
    await mkdir(sshPath, { recursive: true, mode: 0o700 });
    await writeFile(join(sshPath, "authorized_keys"), publicKey, {
      mode: 0o700,
    });
    await writeFile(join(sshPath, "sshd.conf"), sshd_conf, { mode: 0o700 });

    if (lockdown) {
      // Limits
      if (pids) {
        args.push(`--pids-limit=${pids}`);
      }
      if (memory) {
        args.push(`--memory=${memory}`);
      }
      if (cpu) {
        args.push(`--cpus=${k8sCpuParser(cpu)}`);
      }
      // make root filesystem readonly so can't install new software or waste space
      args.push("--read-only");
    }

    // [ ] TODO: this can't be in actual {path} (home dir) since we don't want it
    // snapshoted in btrfs.  This could be in a scratch directory that is passed
    // in as a parameter when starting file-server.  Using a tmpfs does NOT work,
    // and results in an infinite loop trying to fix permissions (just try a git clone of cocalc)
    // The size is important...
    //     args.push(
    //       "--mount",
    //       "type=tmpfs,tmpfs-size=2G,destination=/root/.mutagen-dev",
    //     );
    const scratch = `/home/wstein/build/cocalc-lite/src/data/btrfs/mnt/scratch/${volume}`;
    try {
      await rm(scratch, { force: true, recursive: true });
    } catch {}
    await mkdir(scratch, { recursive: true });
    args.push("-v", `${scratch}:/root/.mutagen-dev`);
    // Mutagen with agent pre-installed (alternatively: we could
    // build this into the image)
    const mutagen = await getMutagenAgent();
    args.push(
      "-v",
      `${mutagen.path}:/root/.mutagen-dev/agents/${mutagen.version}:ro`,
    );

    // openssh server
    args.push("-p", "22");
    //  /usr/sbin/sshd -D -e -f /root/.ssh/file-server/sshd.conf
    args.push(
      "--rm",
      IMAGE,
      "/usr/sbin/sshd",
      "-D",
      "-e",
      "-f",
      "/root/.ssh/file-server/sshd.conf",
    );
    logger.debug(
      `Start file-system project container: '${cmd} ${args.join(" ")}'`,
    );

    child = spawn(cmd, args);
    children[volume] = child;
    // @ts-ignore
    child.publicKey = publicKey;
    child.authorizedKeys = authorizedKeys;
    logger.debug("started ssh container", { volume, pid: child.pid });
    // [ ] TODO: it would be more efficient to just assign ports ourself, given
    // we control the fileserver.
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
          if (ports[22]) {
            // @ts-ignore
            child.sshPort = ports[22];
            return true;
          }
        } catch (err) {
          console.log("got ports error", err);
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
