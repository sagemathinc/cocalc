/*
Container associated to a project that runs on the file-server:

- runs an openssh server, which is used by the project
  and compute servers to synchronize all files in /root
  (the home directory)
- is an rsync target for the overlayfs upper layer
- reflect forwards several ports here:
   - an ssh server running in the project itself
   - an http proxy server

*/

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";
import { build } from "@cocalc/backend/podman/build-container";
import { k8sCpuParser, split } from "@cocalc/util/misc";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { delay } from "awaiting";
import * as sandbox from "@cocalc/backend/sandbox/install";
import { SSHD_CONFIG } from "@cocalc/conat/project/runner/constants";
import {
  FILE_SERVER_NAME,
  Ports,
  PORTS,
} from "@cocalc/conat/project/runner/constants";
import { mountArg, podman } from "@cocalc/backend/podman";
import { sha1 } from "@cocalc/backend/sha1";

const FAIR_CPU_MODE = true;

const GRACE_PERIOD_S = "1";

const IDLE_CHECK_INTERVAL = 30_000;

const logger = getLogger("file-server:ssh:container");

const APPS = [
  "btm",
  "rg",
  "fd",
  "dust",
  "rustic",
  "ouch",
  "reflect-sync",
] as const;
const Dockerfile = `
FROM docker.io/ubuntu:25.10

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y ssh rsync
COPY ${APPS.map((path) => sandbox.SPEC[path].binary).join(" ")} /usr/local/bin/
`;

const VERSION = `0.5.10`;
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
GatewayPorts clientspecified
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
    // TODO: think about limits once I've benchmarked
    pids = 100,
    memory = "2000m",
    cpu = "2000m",
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
  }): Promise<Ports> => {
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
    // I unfortunately hit multiple times cases where the pasta.avx process
    // would be pegged forever at 100% cpu, even though everything was
    // completely idle, so there is definitely a major bug with pasta in
    // "podman version 5.4.1".
    args.push("--network", "slirp4netns");
    args.push("--hostname", name);
    args.push(
      "--label",
      `volume=${volume}`,
      "--label",
      `role=file-server`,
      "--label",
      `key=${key}`,
    );

    // mount path containing nodejs so reflect-sync can be run
    args.push(
      mountArg({
        source: dirname(process.execPath),
        target: "/usr/local/sbin",
        readOnly: true,
      }),
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
    // We install the proxy's public key here (not the end-user keys) because the
    // proxy itself sshes into this container on behalf of users; user keys are
    // validated in the auth handler before we ever open the proxy tunnel.
    await writeFile(join(sshdConfPathOnHost, "authorized_keys"), publicKey, {
      mode: 0o600,
    });
    await writeFile(join(sshdConfPathOnHost, "sshd.conf"), sshd_conf, {
      mode: 0o600,
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

  // Prefer the legacy file-server port mapping if present.
  const ports: Partial<Ports> = {};
  let mapped = 0;
  for (const k in PORTS) {
    const val = portMap[PORTS[k]];
    if (val != null) {
      ports[k] = val;
      mapped++;
    }
  }

  // Fallback for project containers that expose standard ports (22, 80).
  if (mapped === 0) {
    if (portMap[22] != null) {
      ports.sshd = portMap[22];
      // Also treat as file-server for compatibility with callers that expect it.
      ports["file-server"] = portMap[22];
    }
    if (portMap[80] != null) {
      ports.proxy = portMap[80];
      ports.web = portMap[80];
    }
  }

  for (const key of ["file-server", "sshd", "proxy", "web"] as const) {
    if (ports[key] == null) {
      throw Error(`BUG -- missing port mapping for ${key}`);
    }
  }

  return ports as Ports;
}

async function inspectPorts(name: string): Promise<Ports> {
  const { stdout } = await podman([
    "inspect",
    name,
    "--format",
    "{{json .NetworkSettings.Ports}}",
  ]);
  return jsonToPorts(JSON.parse(stdout));
}

export const getPorts = reuseInFlight(
  async ({ volume }: { volume: string }): Promise<Ports> => {
    const tried: string[] = [];
    const names = [containerName(volume), volume];
    for (const name of names) {
      tried.push(name);
      try {
        return await inspectPorts(name);
      } catch (err) {
        logger.debug("getPorts inspect failed", { name, err: `${err}` });
      }
    }
    throw new Error(
      `unable to inspect ports for ${volume}; tried ${tried.join(", ")}`,
    );
  },
);

export async function stop({
  volume,
  force,
}: {
  volume: string;
  force?: boolean;
}) {
  try {
    logger.debug("stopping", { volume });
    await podman([
      "rm",
      "-f",
      "-t",
      force ? "0" : GRACE_PERIOD_S,
      containerName(volume),
    ]);
  } catch (err) {
    logger.debug("stop error", { volume, err });
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
    files: APPS.map((name) => sandbox.SPEC[name].path),
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
  const parseStartedAt = (val: string): number | null => {
    // podman outputs either a unix timestamp (seconds) or an ISO 
    // string depending on version, so we make sure we can parse either
    // rather than hoping things are what we expect.
    if (/^\d+$/.test(val)) {
      return parseInt(val, 10) * 1000;
    }
    const t = Date.parse(val);
    return Number.isNaN(t) ? null : t;
  };

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
      const startedMs = parseStartedAt(startedAt);
      if (startedMs != null && now - startedMs >= minAge) {
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

  await stopAll();
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
    `--filter=name=${FILE_SERVER_NAME}-`,
    `--filter=label=role=file-server`,
    `--format={{ index .Labels "volume" }}`,
  ]);
  return stdout.split("\n").filter((x) => x);
}

// important to clear on startup, because for whatever reason the file-server containers
// do NOT work if we restart sshpiperd, so best to stop them all.
// They don't work without the proxy anyways.  We can't kill all on shutdown unless
// we make them child processes (we could do that).

export async function stopAll() {
  logger.debug(`stopping all ${FILE_SERVER_NAME} containers`);
  monitoring = false;
  const v: any[] = [];
  const volumes = await getAll();
  logger.debug(volumes);
  for (const volume of volumes) {
    logger.debug("stopping", { volume });
    v.push(stop({ volume, force: true }));
  }
  await Promise.all(v);
}
