/*
This sidecar solves an otherwise VERY tricky problem!

PROBLEM: We want to allow users to run fairly arbitrary root filesystem
images. In particular, those images might not include an ssh client -- in fact,
the default minimal images from Ubuntu, SUSE, and everybody else do NOT
include ssh. Mutagen fundamentally requires that we have an ssh client.
(For security reasons often container images do NOT want ssh installed.)

SOLUTION:  Instead of running mutagen only under the main root filesystem where
ssh might not be present (and might even be complicated to install), we
instead create a tiny alpine linux sidecar, which does have ssh installed.
It starts the mutagen daemon on startup.  Because it's in the same pod,
all the mutagen commands in the main pod suddenly "just work", because
they all use the daemon!  There's one caveat -- if you don't have ssh installed
and you stop/start the daemon, then of course things break. Deal with it.

COCALC-LITE?
The same problem will come up for cocalc-lite, where we aren't running
any containers.  But in that case, I think it is reasonable to require
the user to install ssh, since they will be running usually on a laptop
or remote server, where ssh is highly likely to be installed anyways (otherwise,
how did they get to that server).
*/

import { build } from "@cocalc/backend/podman/build-container";
import { podman } from "./podman";
import { bootlog } from "@cocalc/conat/project/runner/bootlog";
//import { rm } from "node:fs/promises";
import { join } from "path";
import { PROJECT_IMAGE_PATH } from "@cocalc/util/db-schema/defaults";
import { getPaths as getOverlayPaths } from "./overlay";
import rsyncProgress from "./rsync-progress";
import { mountArg } from "./mounts";

// Increase this version tag right here if you change
// any of the Dockerfile or any files it uses:
export const sidecarImageName = "localhost/sidecar:0.4.4";

const Dockerfile = `
FROM docker.io/ubuntu:25.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y openssh-client rsync

COPY delete-extra.js /usr/local/bin/delete-extra.js
COPY backup-rootfs.sh /usr/local/bin/backup-rootfs.sh
COPY restore-rootfs.sh /usr/local/bin/restore-rootfs.sh
RUN chmod a+x /usr/local/bin/*
`;

const BACKUP_ROOTFS_SH = `
#!/bin/bash
set -euo pipefail

(cd /rootfs/lowerdir && find . -print0 | sort -z) > /tmp/lower.nul
(cd /rootfs/merged   && find . -print0 | sort -z) > /tmp/merged.nul
comm -z -23 /tmp/lower.nul /tmp/merged.nul > /rootfs/merged/root/deleted.nul

ssh file-server mkdir -p /root/.local/share/overlay/$ROOTFS_IMAGE/

rsync -Hax --delete --numeric-ids \
      --no-inc-recursive --info=progress2 --no-human-readable \
      --compare-dest=/rootfs/lowerdir /rootfs/merged/ file-server:/root/.local/share/overlay/$ROOTFS_IMAGE/
`;

const RESTORE_ROOTFS_SH = `
#!/bin/bash
set -euo pipefail

rsync -Hax --numeric-ids \
      --no-inc-recursive --info=progress2 --no-human-readable \
      file-server:/root/.local/share/overlay/$ROOTFS_IMAGE/ /rootfs/merged/

node /usr/local/bin/delete-extra.js
`;

export async function init() {
  await build({
    name: sidecarImageName,
    Dockerfile,
    files: [join(__dirname, "delete-extra.js")],
    fileContents: {
      "backup-rootfs.sh": BACKUP_ROOTFS_SH,
      "restore-rootfs.sh": RESTORE_ROOTFS_SH,
    },
  });
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
}) {
  bootlog({ project_id, type: "start-sidecar", progress: 0 });
  // sidecar: refactor
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
    "--init",
  ];
  for (const path in mounts) {
    args2.push(
      mountArg({ source: path, target: mounts[path], readOnly: true }),
    );
  }
  args2.push(mountArg({ source: home, target: env.HOME }));
  const { lowerdir, merged } = getOverlayPaths({ image, project_id, home });
  args2.push(
    mountArg({
      source: lowerdir,
      target: "/rootfs/lowerdir",
      readOnly: true,
    }),
  );
  args2.push(
    mountArg({ source: merged, target: "/rootfs/merged", readOnly: false }),
  );

  for (const name in env) {
    args2.push("-e", `${name}=${env[name]}`);
  }

  args2.push("-e", `ROOTFS_IMAGE=${image}`);

  args2.push(sidecarImageName, "mutagen", "daemon", "run");

  bootlog({
    project_id,
    type: "start-sidecar",
    progress: 5,
    desc: "reset sync state",
  });

  await podman(args2);
  bootlog({
    project_id,
    type: "start-sidecar",
    progress: 25,
    desc: "started pod",
  });

  const knownMutagenSessions = await getMutagenSessions(name);

  const upperdir = join(PROJECT_IMAGE_PATH, image, "upperdir");
  const copyRootfs = async () => {
    if (knownMutagenSessions.has("rootfs")) {
      return;
    }
    bootlog({
      project_id,
      type: "copy-rootfs",
      progress: 0,
      desc: "copy rootfs to project runner",
    });
    await rsyncProgress({
      name,
      args: [
        "-axH",
        "--update",
        // using aes128 seems a LOT faster/better given the hop through sshpiperd
        "-e",
        "ssh -o Compression=no -c aes128-gcm@openssh.com",
        "--compress",
        "--compress-choice=lz4",
        "--ignore-missing-args", // so works even if remote upperdir does not exist yet (a common case!)
        "--relative", // so don't have to create the directories locally
        `file-server:${upperdir}/`,
        "/root/",
      ],
      progress: (event) => {
        bootlog({
          project_id,
          type: "copy-rootfs",
          ...event,
        });
      },
    });

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
        "--exclude",
        ".local/share/overlay/**",
        "--exclude",
        ".cache/cocalc/**",
        "--exclude",
        ".mutagen-dev/**",
        "--exclude",
        ".ssh/**",
        "--exclude",
        ".snapshots/**",
        `file-server:/root/`,
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

    bootlog({
      project_id,
      type: "start-sidecar",
      progress: 100,
      desc: "updated home directory",
    });
  };

  await Promise.all([copyRootfs(), copyHome()]);

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
      "file-server",
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
    if (false && !knownMutagenSessions.has("rootfs")) {
      await podman([
        "exec",
        name,
        "mutagen",
        "sync",
        "create",
        "--name=rootfs",
        "--mode=one-way-replica",
        // these two mode lines make it so the rootfs is saved by mutagen to be maximally permissive,
        // so it is possible to fully use a different user (not root) in the container, since
        // sometimes that is important (e.g., sage won't build as root due to bugs).  They basically
        // make it so roots files are visible to all users in the container, which is fine given
        // the main user is root anyways.  Without this, if you were to restore the files suddenly
        // everything is broken for any non-root user.   The other option would be two create a manifest
        // of all permissions on shutdown and restore on checkout, which is more complexity.  Given
        // that, e.g., "read only" is barely in the cocalc UI, not having it seems fine.
        "--default-file-mode-beta=0666",
        "--default-directory-mode-beta=0777",
        "--symlink-mode=posix-raw",
        "--compression=deflate",
        join("/root", upperdir),
        `file-server:/root/${upperdir}`,
      ]);
    }
    bootlog({
      project_id,
      type: "start-file-sync",
      progress: 60,
      desc: "initialized rootfs sync",
    });

    if (!knownMutagenSessions.has("home")) {
      await podman([
        "exec",
        name,
        "mutagen",
        "sync",
        "create",
        // interval on project side (this is the default actually)
        "--watch-polling-interval-alpha=10",
        // polling interval on the file-server side, where
        // reducing load matters the most:
        "--watch-polling-interval-beta=15",
        "--name=home",
        "--mode=two-way-safe",
        "--symlink-mode=posix-raw",
        "--compression=deflate",
        "--ignore",
        ".local/share/overlay/**",
        "--ignore",
        ".cache/cocalc/**",
        "--ignore",
        ".mutagen-dev/**",
        "--ignore",
        ".ssh/**",
        "--ignore",
        ".snapshots/**",
        "/root",
        `file-server:/root`,
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
