/*
Manager container that is the target of ssh.
*/

import { spawn, execFile as execFile0 } from "node:child_process";
import { promisify } from "node:util";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";
import { build } from "@cocalc/backend/podman/build-container";
import { getMutagenAgent } from "./mutagen";
import { k8sCpuParser, split } from "@cocalc/util/misc";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { until } from "@cocalc/util/async-utils";
import { delay } from "awaiting";
import { mountArg } from "@cocalc/project-runner/run/mounts";
import { extractBaseImage } from "@cocalc/project-runner/run/overlay";
import * as sandbox from "@cocalc/backend/sandbox/install";

const FAIR_CPU_MODE = true;

const execFile = promisify(execFile0);

const IDLE_CHECK_INTERVAL = 30_000;

const logger = getLogger("file-server:ssh:container");

const APPS = ["btm", "rg", "fd", "dust", "rustic", "ouch"] as const;
const Dockerfile = `
FROM docker.io/ubuntu:25.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y ssh rsync
COPY ${APPS.map((path) => sandbox.SPEC[path].binary).join(" ")} /usr/local/bin/
`;

const IMAGE = "localhost/core:0.2.1";

const seccomp_json = `
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
`;

const PORT = 2222;
const sshd_conf = `
Port ${PORT}
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
    rootfsImage,
    publicKey,
    authorizedKeys,
    // path in which to put directory for mutagen's state, which includes
    // it's potentially large staging area.  This should be on the same
    // btrfs filesystem as projects for optimal performance.  It MUST BE SET, because
    // without this when the user's quota is hit, the sync just restarts, causing an infinite
    // loop wasting resources.  It should also obviously be big.
    scratch,
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
    // rootfsImage = the OCI rootfs image name that is currently being used for this project;
    // this is called "rootfs_image" in the database projects table. If given, this gets
    // pulled, then mounted at /rootfs/lowerdir.
    rootfsImage?: string;
    publicKey: string;
    authorizedKeys: string;
    scratch: string;
    memory?: string;
    cpu?: string;
    pids?: number;
    // can be nice to disable for dev and debugging
    lockdown?: boolean;
  }): Promise<{ sshPort: number }> => {
    if (!scratch) {
      throw Error("scratch directory must be set");
    }
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

    await buildContainerImage();

    const cmd = "podman";
    const args = ["run"];
    // the container is named in a way that is determined by the volume name:
    const name = containerName(volume);
    args.push("--name", name);
    args.push("--hostname", "file-server");
    args.push("--label", `volume=${volume}`, "--label", `role=file-server`);

    if (rootfsImage) {
      const lowerdir = await extractBaseImage(rootfsImage);
      args.push(
        mountArg({
          source: lowerdir,
          target: "/rootfs/lowerdir",
          readOnly: true,
          options: "noexec,nodev,nosuid",
        }),
      );
    }

    // mount the volume contents to the directory /root in the container.
    // Since user can write arbitrary files here, this is noexec, so they
    // can't somehow run them.
    args.push(
      mountArg({
        source: path,
        target: "/root",
        options: "noexec,nodev,nosuid",
      }),
    );

    const sshPath = join(path, ".ssh", "file-server");
    await mkdir(sshPath, { recursive: true, mode: 0o700 });
    await writeFile(join(sshPath, "authorized_keys"), publicKey, {
      mode: 0o700,
    });
    await writeFile(join(sshPath, "sshd.conf"), sshd_conf, { mode: 0o700 });
    // this secomp is here just because it needs to be somewhere...
    const secompPath = join(sshPath, "seccomp.json");
    await writeFile(secompPath, seccomp_json, {
      mode: 0o700,
    });

    args.push("-p", `${PORT}`);

    if (lockdown) {
      args.push(
        "--cap-drop",
        "ALL",
        // SYS_CHROOT: needed for ssh each time we get a new connection
        "--cap-add",
        "SYS_CHROOT",
        "--cap-add",
        "SETGID",
        "--cap-add",
        "SETUID",
        // CHOWN: needed to rsync rootfs and preserve uid's
        "--cap-add",
        "CHOWN",
        // FSETID: needed to preserve setuid/setgid bits (e.g,. so ping for regular users works)
        "--cap-add",
        "FSETID",
        // FOWNER: needed to set permissions when rsync'ing rootfs
        "--cap-add",
        "FOWNER",
        // these two are so root can see inside non-root user paths when doing backups of rootfs
        "--cap-add",
        "DAC_READ_SEARCH",
        "--cap-add",
        "DAC_OVERRIDE",
      );
      args.push("--security-opt", `seccomp=${secompPath}`);

      // Limits
      if (pids) {
        args.push(`--pids-limit=${pids}`);
      }
      if (memory) {
        args.push(`--memory=${memory}`);
      }
      if (FAIR_CPU_MODE) {
        args.push("--cpu-shares=128");
      } else if (cpu) {
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
    const dotMutagen = join(scratch, volume);
    dotMutagens[volume] = dotMutagen;
    try {
      await rm(dotMutagen, { force: true, recursive: true });
    } catch {}
    await mkdir(dotMutagen, { recursive: true });
    args.push(mountArg({ source: dotMutagen, target: "/root/.mutagen-dev" }));
    // Mutagen with agent pre-installed (alternatively: we could
    // build this into the image)
    const mutagen = await getMutagenAgent();
    args.push(
      mountArg({
        source: mutagen.path,
        target: `/root/.mutagen-dev/agents/${mutagen.version}`,
        readOnly: true,
      }),
    );

    // openssh server
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
          if (ports[PORT]) {
            // @ts-ignore
            child.sshPort = ports[PORT];
            return true;
          }
        } catch (err) {
          logger.debug("WARNING: got ports error", err);
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

const dotMutagens: { [volume: string]: string } = {};

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
  const dotMutagen = dotMutagens[volume];
  if (dotMutagen) {
    try {
      await rm(dotMutagen, { force: true, recursive: true });
    } catch {}
    delete dotMutagens[volume];
  }
}

export const buildContainerImage = reuseInFlight(async () => {
  // make sure apps are installed
  const v: any[] = [];
  for (const app of APPS) {
    v.push(sandbox.install(app));
  }
  await Promise.all(v);

  // make sure our ssh image is available
  await build({
    name: IMAGE,
    Dockerfile,
    files: APPS.map((name) => sandbox[name]),
  });
});

export async function getProcesses(name) {
  try {
    const { stdout } = await execFile("podman", [
      "exec",
      name,
      "ps",
      "-o",
      "ucmd",
      "--no-headers",
    ]);
    return split(stdout.toString());
  } catch {
    return [];
  }
}

export async function terminateIfIdle(name): Promise<boolean> {
  if ((await getProcesses(name)).includes("sshd-session")) {
    // has an open ssh session
    return false;
  }
  await execFile("podman", ["rm", "-f", "-t", "0", name]);
  return true;
}

export async function terminateAllIdle({
  minAge = 15_000,
}: { minAge?: number } = {}) {
  const { stdout } = await execFile("podman", [
    "ps",
    "-a",
    "--filter=label=role=file-server",
    "--format",
    "{{.Names}} {{.StartedAt}}",
  ]);
  const tasks: any[] = [];
  const now = Date.now();
  let killed = 0;
  const f = async (name) => {
    if (await terminateIfIdle(name)) {
      killed += 1;
    }
  };
  let total = 0;
  for (const x of stdout.toString().trim().split("\n")) {
    const w = split(x);
    if (w.length == 2) {
      total++;
      const [name, startedAt] = w;
      if (now - parseInt(startedAt) * 1000 >= minAge) {
        tasks.push(f(name));
      }
    }
  }
  await Promise.all(tasks);
  return { killed, total };
}

let monitoring = false;
export async function init() {
  if (monitoring) return;
  monitoring = true;
  while (monitoring) {
    try {
      logger.debug(`scanning for idle file-system containers...`);
      const { killed, total } = await terminateAllIdle();
      logger.debug(`file-system container idle check`, { total, killed });
    } catch (err) {
      logger.debug(
        "WARNING -- issue terminating idle file-system containers",
        err,
      );
    }
    await delay(IDLE_CHECK_INTERVAL);
  }
}

export async function close() {
  monitoring = false;
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
