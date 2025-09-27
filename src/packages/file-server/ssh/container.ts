/*
Manager container that is the target of ssh.
*/

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";
import { build } from "@cocalc/backend/podman/build-container";
import { getMutagenAgent } from "./mutagen";
import { k8sCpuParser, split } from "@cocalc/util/misc";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { delay } from "awaiting";
import { mountArg } from "@cocalc/project-runner/run/mounts";
import * as sandbox from "@cocalc/backend/sandbox/install";
import {
  START_PROJECT_SSH,
  SSHD_CONFIG,
} from "@cocalc/conat/project/runner/constants";
import {
  FILE_SERVER_NAME,
  Ports,
  PORTS,
} from "@cocalc/conat/project/runner/constants";
import { podman } from "@cocalc/project-runner/run/podman";
import { sha1 } from "@cocalc/backend/sha1";

const FAIR_CPU_MODE = true;

const GRACE_PERIOD_S = "1";

const IDLE_CHECK_INTERVAL = 30_000;

const logger = getLogger("file-server:ssh:container");

const APPS = ["btm", "rg", "fd", "dust", "rustic", "ouch"] as const;
const Dockerfile = `
FROM docker.io/ubuntu:25.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y ssh rsync
COPY ${APPS.map((path) => sandbox.SPEC[path].binary).join(" ")} /usr/local/bin/
`;

const VERSION = "0.3.5";
const IMAGE = `localhost/${FILE_SERVER_NAME}:${VERSION}`;

const sshd_conf = `
Port ${PORTS["file-server"]}
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM no
PermitRootLogin yes
PubkeyAuthentication yes
AuthorizedKeysFile ${SSHD_CONFIG}/authorized_keys
AllowTcpForwarding yes
GatewayPorts no
X11Forwarding no
X11UseLocalhost no
PermitTTY yes
Subsystem sftp internal-sftp
`;

function containerName(volume: string): string {
  return `${FILE_SERVER_NAME}-${volume}`;
}

export const start = reuseInFlight(
  async ({
    volume,
    path,
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
    publicKey: string;
    authorizedKeys: string;
    scratch: string;
    memory?: string;
    cpu?: string;
    pids?: number;
    // can be nice to disable for dev and debugging
    lockdown?: boolean;
  }): Promise<Ports> => {
    if (!scratch) {
      throw Error("scratch directory must be set");
    }
    const name = containerName(volume);
    const key = sha1(publicKey + authorizedKeys);
    try {
      const { stdout } = await podman([
        "inspect",
        name,
        "--format",
        "{{json .Config.Labels.key}}|{{json .NetworkSettings.Ports}}",
      ]);
      const x = stdout.split("|");
      const storedKey = JSON.parse(x[0]);
      if (storedKey == key) {
        return jsonToPorts(JSON.parse(x[1]));
      } else {
        // I don't understand why things stop working with the key changes...
        logger.debug(`restarting ${name} since key changed`);
        await stop({ volume });
      }
    } catch {}
    // container does not exist -- create it
    const args = ["run"];
    args.push("--detach");
    // the container is named in a way that is determined by the volume name,
    // but we also use labels.
    args.push("--name", name);
    args.push("--hostname", name);
    args.push(
      "--label",
      `volume=${volume}`,
      "--label",
      `role=file-server`,
      "--label",
      `key=${key}`,
    );

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

    const sshdConfPathOnHost = join(path, SSHD_CONFIG);
    await mkdir(sshdConfPathOnHost, { recursive: true, mode: 0o700 });
    await writeFile(join(sshdConfPathOnHost, "authorized_keys"), publicKey, {
      mode: 0o600,
    });
    await writeFile(join(sshdConfPathOnHost, "sshd.conf"), sshd_conf, {
      mode: 0o600,
    });
    await writeFile(join(path, START_PROJECT_SSH), START_PROJECT_SSH_SCRIPT, {
      mode: 0o700,
    });

    for (const key in PORTS) {
      args.push("-p", `${PORTS[key]}`);
    }

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

    const dotMutagen = join(scratch, volume);
    dotMutagens[volume] = dotMutagen;
    try {
      await rm(dotMutagen, { force: true, recursive: true });
    } catch {}
    await mkdir(dotMutagen, { recursive: true });
    args.push(mountArg({ source: dotMutagen, target: "/root/.mutagen-dev" }));
    // Mutagen agent mounted in
    const mutagen = await getMutagenAgent();
    args.push(
      mountArg({
        source: mutagen.path,
        target: `/root/.mutagen-dev/agents/${mutagen.version}`,
        readOnly: true,
      }),
    );

    // openssh server
    //  /usr/sbin/sshd -D -e -f /root/{SSHD_CONFIG}/sshd.conf
    args.push(
      "--rm",
      IMAGE,
      "/usr/sbin/sshd",
      "-D",
      "-e",
      "-f",
      `/root/${SSHD_CONFIG}/sshd.conf`,
    );
    logger.debug(`Start file-system container: 'podman ${args.join(" ")}'`);
    await podman(args);
    logger.debug("Started file-system container", { volume });
    const ports = await getPorts({ volume });
    logger.debug("Got ports", { volume, ports });
    return ports;
  },
);

function jsonToPorts(obj) {
  // obj looks like this:
  //   obj = {
  //     "2222/tcp": [{ HostIp: "0.0.0.0", HostPort: "42419" }],
  //     "2223/tcp": [{ HostIp: "0.0.0.0", HostPort: "38437" }],
  //     "2224/tcp": [{ HostIp: "0.0.0.0", HostPort: "41165" }],
  //     "2225/tcp": [{ HostIp: "0.0.0.0", HostPort: "34057" }],
  //   };
  const portMap: { [p: number]: number } = {};
  for (const k in obj) {
    const port = parseInt(k.split("/")[0]);
    portMap[port] = obj[k][0].HostPort;
  }
  const ports: Partial<Ports> = {};
  for (const k in PORTS) {
    ports[k] = portMap[PORTS[k]];
    if (ports[k] == null) {
      throw Error("BUG -- not all ports found");
    }
  }
  return ports as Ports;
}

export async function getPorts({ volume }: { volume: string }): Promise<Ports> {
  const { stdout } = await podman([
    "inspect",
    containerName(volume),
    "--format",
    "{{json .NetworkSettings.Ports}}",
  ]);
  return jsonToPorts(JSON.parse(stdout));
}

const dotMutagens: { [volume: string]: string } = {};

export async function stop({ volume }: { volume: string }) {
  try {
    logger.debug("stopping", { volume });
    await podman(["rm", "-f", "-t", GRACE_PERIOD_S, containerName(volume)]);
  } catch (err) {
    logger.debug("stop error", { volume, err });
  }
  const dotMutagen = dotMutagens[volume];
  if (dotMutagen) {
    try {
      await rm(dotMutagen, { force: true, recursive: true });
    } catch {}
    delete dotMutagens[volume];
  }
}

const buildContainerImage = reuseInFlight(async () => {
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
    const { stdout } = await podman([
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
  await podman(["rm", "-f", "-t", GRACE_PERIOD_S, name]);
  return true;
}

export async function terminateAllIdle({
  minAge = 15_000,
}: { minAge?: number } = {}) {
  const { stdout } = await podman([
    "ps",
    "-a",
    "--filter",
    `name=${FILE_SERVER_NAME}-`,
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

  await buildContainerImage();

  while (monitoring) {
    // wait first, otherwise everything is instantly killed
    // on startup, since sshpiperd itself just got restarted
    // (at least until we daemonize it).
    await delay(IDLE_CHECK_INTERVAL);
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
  }
}

export async function getAll(): Promise<string[]> {
  const { stdout } = await podman([
    "ps",
    "--filter",
    `name=${FILE_SERVER_NAME}-`,
    "--filter",
    "label=role=file-server",
    "--format",
    '{{ index .Labels "volume" }}',
  ]);
  return stdout.split("\n").filter((x) => x.length == 36);
}

export async function close() {
  monitoring = false;
  const v: any[] = [];
  for (const volume in await getAll()) {
    logger.debug("stopping", { volume });
    v.push(stop({ volume }));
  }
  await Promise.all(v);
}

const START_PROJECT_SSH_SCRIPT = `#!/usr/bin/env bash
set -ev

mkdir -p /etc/dropbear

PORT=\${COCALC_SSHD_PORT:=22}

dropbear -p \$PORT -e -s -a -R -D /root/${SSHD_CONFIG}

mutagen forward list sshd 2>/dev/null \
   || mutagen forward create --name=sshd file-server:tcp::${PORTS.project} tcp::\$PORT

ln -sf $(which sftp-server) /usr/libexec/sftp-server || true
`;
