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
import { rm } from "node:fs/promises";
import { join } from "path";
import { PROJECT_IMAGE_PATH } from "@cocalc/util/db-schema/defaults";
import rsyncProgress from "./rsync-progress";

const Dockerfile = `
FROM docker.io/ubuntu:25.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y openssh-client rsync
`;

export const sidecarImageName = "localhost/sidecar:0.4";

export async function init() {
  await build({ name: sidecarImageName, Dockerfile });
}

export async function startSidecar({
  image,
  project_id,
  mounts,
  env,
  pod,
  home,
  servers,
}) {
  bootlog({ project_id, type: "start-sidecar", progress: 0 });
  // sidecar: refactor
  const sidecarPodName = `sidecar-${project_id}`;
  const args2 = [
    "run",
    `--name=${sidecarPodName}`,
    "--detach",
    "--rm",
    "--replace",
    "--pod",
    pod,
    "--init",
  ];
  for (const path in mounts) {
    args2.push("-v", `${path}:${mounts[path]}:ro`);
  }
  args2.push("-v", `${home}:${env.HOME}`);
  for (const name in env) {
    args2.push("-e", `${name}=${env[name]}`);
  }

  args2.push(sidecarImageName, "mutagen", "daemon", "run");

  // always start with fresh .mutagen
  await rm(join(home, ".mutagen-dev"), { force: true, recursive: true });
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

  if (servers.length == 0) {
    // shouldn't happen
    bootlog({
      project_id,
      type: "start-sidecar",
      progress: 100,
    });
    return;
  }

  const upperdir = join(PROJECT_IMAGE_PATH, image, "upperdir");
  const copyRootfs = async () => {
    bootlog({
      project_id,
      type: "copy-rootfs",
      progress: 0,
      desc: "copy rootfs to project runner",
    });
    await rsyncProgress({
      pod: sidecarPodName,
      args: [
        "-axH",
        // using aes128 seems a LOT faster/better given the hop through sshpiperd
        "-e",
        "ssh -o Compression=no -c aes128-gcm@openssh.com",
        "--compress",
        "--compress-choice=lz4",
        "--ignore-missing-args", // so works even if remote upperdir does not exist yet (a common case!)
        "--relative", // so don't have to create the directories locally
        `${servers[0].name}:${upperdir}/`,
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
    bootlog({
      project_id,
      type: "copy-home",
      progress: 0,
      desc: "copy home directory to project runner",
    });
    await rsyncProgress({
      pod: sidecarPodName,
      args: [
        "-axH",
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
        `${servers[0].name}:/root/`,
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

  return async () => {
    bootlog({
      project_id,
      type: "mutagen-init",
      progress: 0,
      desc: "initializing file sync",
    });

    // It's critical to make this directory if it does not exist.  Otherwise,
    // mutagen refuses to proceed with the error (by design):
    //  <root>: unable to walk to transition root parent: unable to open synchronization
    //  root parent directory: no such file or directory
    await podman([
      "exec",
      sidecarPodName,
      "ssh",
      servers[0].name,
      "mkdir",
      "-p",
      upperdir,
    ]);
    bootlog({
      project_id,
      type: "mutagen-init",
      progress: 20,
      desc: "created rootfs path",
    });

    // NOTES:
    //   Do NOT use --max-staging-file-size=500M say, since
    //   if you do then any time there is a file over that size,
    //   mutagen gets stuck in an infinite loop trying repeatedly
    //   to resend it!  NOT good.
    await podman([
      "exec",
      sidecarPodName,
      "mutagen",
      "sync",
      "create",
      "--name=rootfs",
      "--mode=one-way-replica",
      "--symlink-mode=posix-raw",
      "--compression=deflate",
      join("/root", upperdir),
      `${servers[0].name}:${upperdir}`,
    ]);
    bootlog({
      project_id,
      type: "mutagen-init",
      progress: 60,
      desc: "initialized rootfs sync",
    });

    await podman([
      "exec",
      sidecarPodName,
      "mutagen",
      "sync",
      "create",
      // interval on project side (this is the default actually)
      "--watch-polling-interval-alpha=10",
      // polling interval on the file-server side, where
      // reducing load matters the most:
      "--watch-polling-interval-beta=15",
      "--name=home",
      "--mode=two-way-resolved",
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
      `${servers[0].name}:/root`,
    ]);
    bootlog({
      project_id,
      type: "mutagen-init",
      progress: 100,
      desc: "initialized home directory sync",
    });
  };
}
