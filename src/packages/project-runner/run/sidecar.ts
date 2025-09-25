/*
This sidecar solves an otherwise VERY tricky problem!

PROBLEM: We want to allow users to run fairly arbitrary root filesystem
images. In particular, those images might not include an ssh client -- in fact,
the default minimal images from Ubuntu, SUSE, and everybody else do NOT
include ssh. Mutagen fundamentally requires that we have an ssh client.
(For security reasons often container images do NOT want ssh installed.)

SOLUTION:  Instead of running mutagen only under the main root filesystem where
ssh might not be present (and might even be complicated to install), we
instead create a Linux sidecar, which does have ssh installed.
It starts the mutagen daemon on startup.  Because it's in the same pod,
all the mutagen commands in the main pod suddenly "just work", because
they all use the daemon!  There's one caveat -- if you don't have ssh installed
and you stop/start the daemon, then of course things break. Deal with it.

ROOTFS AND OVERLAYFS: This code also implements scripts that do backup/restore
for rootfs over rsync AND preserve uid/gid/etc., all safely entirely rootless
and allowing for a large base image which doesn't slow it down:

  - it's cool that this is possible!
  - the code isn't very long but took a lot of work to figure out.

COCALC-LITE?

The same problem will come up for cocalc-lite and compute servers, where we
aren't necessarily running any containers. But in that case, I think it is
reasonable to require the user to install ssh, since they will be running
usually on a laptop or remote server, where ssh is highly likely to be installed
anyways (otherwise, how did they get to that server).

*/

import { build } from "@cocalc/backend/podman/build-container";
import { podman, starting } from "./podman";
import { bootlog } from "@cocalc/conat/project/runner/bootlog";
import { join } from "path";
import { PROJECT_IMAGE_PATH } from "@cocalc/util/db-schema/defaults";
import { COCALC_PROJECT_CACHE } from "./env";
import { getPaths as getOverlayPaths } from "./overlay";
import rsyncProgress, { rsyncProgressRunner } from "./rsync-progress";
import { initSshKeys } from "@cocalc/backend/ssh-keys";
import { mountArg } from "./mounts";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("project-runner:sidecar");

// Increase this version tag right here if you change
// any of the Dockerfile or any files it uses:

// home directory of the side user, relative to /root:
export const SIDECAR_HOME = ".cache/cocalc-sidecar";

export const sidecarImageName = "localhost/sidecar:0.6.0";

const Dockerfile = `
FROM docker.io/ubuntu:25.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y openssh-client rsync

COPY backup-rootfs.sh /usr/local/bin/backup-rootfs.sh
COPY restore-rootfs.sh /usr/local/bin/restore-rootfs.sh
RUN chmod a+x /usr/local/bin/*
`;

// The backup and restore scripts assume overlayfs was mounted using:
//     xino=off,metacopy=off,redirect_dir=off
const BACKUP_ROOTFS_SH = `
#!/bin/bash
set -euo pipefail

mkdir -p /root/${PROJECT_IMAGE_PATH}/\${COMPUTE_SERVER_ID:-0}/$ROOTFS_IMAGE/upperdir/

cd /root
rsync -Hax --delete --numeric-ids \
      "-e" \
      "ssh -o Compression=no -c aes128-gcm@openssh.com" \
      "--compress" \
      "--compress-choice=lz4" \
      --no-inc-recursive --info=progress2 --no-human-readable \
      --delete \
      --relative \
      /root/${PROJECT_IMAGE_PATH}/\${COMPUTE_SERVER_ID:-0}/$ROOTFS_IMAGE/upperdir/ \
      core:/root/
`.trim();

const RESTORE_ROOTFS_SH = `
#!/bin/bash
set -euo pipefail

ssh core mkdir -p /root/${PROJECT_IMAGE_PATH}/\${COMPUTE_SERVER_ID:-0}/$ROOTFS_IMAGE/upperdir/

rsync -Hax --numeric-ids \
      "-e" \
      "ssh -o Compression=no -c aes128-gcm@openssh.com" \
      "--compress" \
      "--compress-choice=lz4" \
      --no-inc-recursive --info=progress2 --no-human-readable \
      --delete \
      --relative \
      core:/root/${PROJECT_IMAGE_PATH}/\${COMPUTE_SERVER_ID:-0}/$ROOTFS_IMAGE/upperdir/   \
      /root/

`.trim();

// run backups of all running projects, then wait this long, then do it again, etc.
const BACKUP_ROOTFS_INTERVAL = 30_000;

export async function init() {
  logger.debug("init");
  await build({
    name: sidecarImageName,
    Dockerfile,
    fileContents: {
      "backup-rootfs.sh": BACKUP_ROOTFS_SH,
      "restore-rootfs.sh": RESTORE_ROOTFS_SH,
    },
  });

  backupRootfsLoop();
}

export function sidecarContainerName(project_id) {
  return `sidecar-project-${project_id}`;
}

export async function startSidecar({
  image,
  project_id,
  mounts,
  env,
  pod,
  home,
  sshServers,
}) {
  logger.debug("startSidecar", { image, project_id });
  bootlog({ project_id, type: "start-sidecar", progress: 0 });

  await initSshKeys({ home: join(home, SIDECAR_HOME), sshServers });

  bootlog({
    project_id,
    type: "start-sidecar",
    progress: 10,
    desc: "initialized ssh keys",
  });

  const name = sidecarContainerName(project_id);
  const args2 = [
    "run",
    `--name=${name}`,
    "--detach",
    "--label",
    `project_id=${project_id}`,
    "--label",
    `role=project`,
    "--rm",
    "--memory=2G",
    "--cpu-shares=256",
    "--pids-limit=200",
    "--replace",
    "--pod",
    pod,
    "-e",
    `HOME=/home/root/${SIDECAR_HOME}`,
    "--init",
  ];
  for (const path in mounts) {
    args2.push(
      mountArg({ source: path, target: mounts[path], readOnly: true }),
    );
  }
  args2.push(mountArg({ source: home, target: env.HOME }));

  for (const name in env) {
    args2.push("-e", `${name}=${env[name]}`);
  }

  args2.push("-e", `ROOTFS_IMAGE=${image}`);

  args2.push(sidecarImageName, "mutagen", "daemon", "run");

  await podman(args2);

  bootlog({
    project_id,
    type: "start-sidecar",
    progress: 25,
    desc: "started pod",
  });

  const knownMutagenSessions = await getMutagenSessions(name);

  const copyRootfs = async () => {
    const { upperdir } = getOverlayPaths({
      image,
      project_id,
      home,
    });

    if (!(await exists(upperdir))) {
      // we have never grabbed the rootfs, so grab it from the core:
      bootlog({
        project_id,
        type: "copy-rootfs",
        progress: 0,
        desc: "copy rootfs to project runner",
      });

      await rsyncProgressRunner({
        command: "podman",
        args: ["exec", name, "/bin/bash", "/usr/local/bin/restore-rootfs.sh"],
        progress: (event) => {
          bootlog({
            project_id,
            type: "copy-rootfs",
            ...event,
          });
        },
      });
    }

    bootlog({
      project_id,
      type: "start-sidecar",
      progress: 50,
      desc: "finished copying rootfs",
    });
  };

  const copyHome = async () => {
    if (knownMutagenSessions.has("home")) {
      return;
    }
    bootlog({
      project_id,
      type: "copy-home",
      progress: 0,
      desc: "copy home directory to project runner",
    });
    await rsyncProgress({
      name,
      args: [
        "-axH",
        "--sparse",
        "-e",
        "ssh -o Compression=no -c aes128-gcm@openssh.com",
        "--compress",
        "--compress-choice=lz4",
        `--exclude=/${PROJECT_IMAGE_PATH}`,
        `--exclude=/${COCALC_PROJECT_CACHE}`,
        `--exclude=/${SIDECAR_HOME}`,
        "--exclude=/.mutagen*",
        "--exclude=/.snapshots",
        `core:/root/`,
        "/root/",
      ],
      progress: (event) => {
        bootlog({
          project_id,
          type: "copy-home",
          ...event,
        });
      },
    });
  };

  await Promise.all([copyRootfs(), copyHome()]);

  bootlog({
    project_id,
    type: "start-sidecar",
    progress: 100,
    desc: "updated rootfs and home directory",
  });

  const initFileSync = async () => {
    bootlog({
      project_id,
      type: "start-file-sync",
      progress: 0,
      desc: "initializing file sync",
    });

    // It's critical to make this directory if it does not exist.  Otherwise,
    // mutagen refuses to proceed with the error (by design):
    //  <root>: unable to walk to transition root parent: unable to open synchronization
    //  root parent directory: no such file or directory
    await podman([
      "exec",
      name,
      "ssh",
      "core",
      "mkdir",
      "-p",
      join(PROJECT_IMAGE_PATH, image),
    ]);
    bootlog({
      project_id,
      type: "start-file-sync",
      progress: 20,
      desc: "created rootfs path",
    });

    // NOTES:
    //   Do NOT use --max-staging-file-size=500M say, since
    //   if you do then any time there is a file over that size,
    //   mutagen gets stuck in an infinite loop trying repeatedly
    //   to resend it!  NOT good.
    if (!knownMutagenSessions.has("home")) {
      await podman([
        "exec",
        name,
        "mutagen",
        "sync",
        "create",
        // interval on project side (this is the default actually)
        "--watch-polling-interval-alpha=10",
        // polling interval on the core side, where
        // reducing load matters the most:
        "--watch-polling-interval-beta=15",
        "--name=home",
        "--mode=two-way-safe",
        "--symlink-mode=posix-raw",
        "--compression=deflate",
        `--ignore=/${PROJECT_IMAGE_PATH}`,
        `--ignore=/${COCALC_PROJECT_CACHE}`,
        `--ignore=/${SIDECAR_HOME}`,
        "--ignore=/.mutagen**",
        "--ignore=/.snapshots",
        "/root",
        "core:/root",
      ]);
    }
    bootlog({
      project_id,
      type: "start-file-sync",
      progress: 100,
      desc: "initialized home directory sync",
    });
  };

  return initFileSync;
}

export async function backupRootfs({ project_id }) {
  const name = sidecarContainerName(project_id);
  const t = Date.now();
  logger.debug("backupRootfs: STARTED", { project_id });
  bootlog({
    project_id,
    type: "save-rootfs",
    progress: 0,
    desc: "backing up rootfs",
  });
  // NOTE: very important to *not* do a backup while project is initially opening/loading, which
  // is why we have to check that the project is running.
  if (starting.has(project_id)) {
    logger.debug("backupRootfs: skipping since currently starting");
    return;
  }
  try {
    await rsyncProgressRunner({
      command: "podman",
      args: ["exec", name, "/bin/bash", "/usr/local/bin/backup-rootfs.sh"],
      progress: (event) => {
        bootlog({
          project_id,
          type: "save-rootfs",
          ...event,
        });
      },
    });
  } catch (err) {
    if (`${err}`.includes("no container with name")) {
      // it was deleted.
      return;
    } else {
      throw err;
    }
  }
  logger.debug("backupRootfs: DONE", { project_id, ms: Date.now() - t });
}

// we back up each one in serial rather than parallel, to
// avoid too much of a load spike.  Also reuseInFlight ensures
// we don't run this on top of itself.
export const backupAllRootFs = reuseInFlight(async () => {
  logger.debug("backupAllRootFs: START");
  const t = Date.now();
  const { stdout } = await podman([
    "ps",
    "--filter",
    `name=sidecar-project-`,
    "--filter",
    "label=role=project",
    "--format",
    '{{ index .Labels "project_id" }}',
  ]);
  for (const project_id of stdout.split("\n").filter((x) => x.length == 36)) {
    try {
      await backupRootfs({ project_id });
    } catch (err) {
      // this should maybe message admins (?)
      // but obviously not fatal, since we want to backup all of them.
      logger.debug("backupAllRootFs: WARNING -- error creating backup", err);
    }
  }
  logger.debug("backupAllRootFs: DONE", { ms: Date.now() - t });
});

let initialized = false;
async function backupRootfsLoop() {
  if (initialized) {
    return;
  }
  initialized = true;
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, BACKUP_ROOTFS_INTERVAL));
    await backupAllRootFs();
  }
}

export async function flushMutagen({ project_id }) {
  const name = sidecarContainerName(project_id);

  // flush mutagen sync so we do not loose any work
  bootlog({
    project_id,
    type: "mutagen",
    progress: 0,
    desc: "flushing sync",
  });
  // long timeout (60*60 SECONDS)
  await podman(["exec", name, "mutagen", "sync", "flush", "--all"], 60 * 60);
  bootlog({
    project_id,
    type: "mutagen",
    progress: 100,
    desc: "sync flushed",
  });
}

async function getMutagenSessions(name: string) {
  const { stdout } = await podman([
    "exec",
    name,
    "mutagen",
    "sync",
    "list",
    "--template",
    "{{json .}}",
  ]);
  const v = JSON.parse(stdout);
  return new Set(v.filter((item) => item.name).map((item) => item.name));
}
