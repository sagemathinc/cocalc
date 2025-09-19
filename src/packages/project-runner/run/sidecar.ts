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

FAILED APPROACH: I used dropbear to build a small static ssh client that was
wrapped in a script to make it behave like openssh-client. This
somewhat worked but was really flaky and it was quite difficult to get it
to work.  It was really painful.  So I deleted that.

COCALC-LITE?
The same problem will come up for cocalc-lite, where we aren't running
any containers.  But in that case, I think it is reasonable to require
the user to install ssh, since they will be running usually on a laptop
or remote server, where ssh is highly likely to be installed anyways (otherwise,
how did they get to that server).
*/

import { split } from "@cocalc/util/misc";
import { build } from "@cocalc/backend/podman/build-container";
import { podman } from "./podman";
import { bootlog } from "@cocalc/conat/project/runner/bootlog";
import { rm } from "node:fs/promises";
import { join } from "path";
import { PROJECT_IMAGE_PATH } from "@cocalc/util/db-schema/defaults";
import { spawn } from "node:child_process";
import { once } from "events";

const Dockerfile = `
FROM docker.io/alpine:latest
RUN apk update && apk add --no-cache openssh-client rsync
`;

export const sidecarImageName = "localhost/sidecar:0.3";

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
  await podman(
    [
      "exec",
      sidecarPodName,
      "rsync",
      "--ignore-missing-args", // so works even if remote upperdir does not exist yet (a common case!)
      "--relative", // so don't have to create the directories locally
      "-axH",
      `${servers[0].name}:${upperdir}/`,
      "/root/",
    ],
    10 * 60,
  );

  bootlog({
    project_id,
    type: "start-sidecar",
    progress: 50,
    desc: "updated rootfs",
  });

  bootlog({
    project_id,
    type: "copy-home",
    progress: 0,
    desc: "copy home directory to project runner",
  });
  const child = spawn("podman", [
    "exec",
    sidecarPodName,
    "rsync",
    "-axH",
    "--outbuf=L",
    "--no-inc-recursive",
    "--info=progress2",
    "--no-human-readable",
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
  ]);

  let stderr = "";
  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });
  let last = 0;
  let lastTime = Date.now();
  child.stdout.on("data", (data) => {
    let time = Date.now();
    if (time - lastTime <= 1000) {
      return;
    }
    const v = split(data.toString());
    if (v[1]?.endsWith("%")) {
      const p = parseInt(v[1].slice(0, -1));
      if (isFinite(p) && p > last) {
        bootlog({
          project_id,
          type: "copy-home",
          progress: last,
          speed: v[2],
          eta: parseEta(v[3]),
        });
        last = p;
        lastTime = time;
      }
    }
  });
  await once(child, "close");
  if (child.exitCode) {
    bootlog({
      project_id,
      type: "copy-home",
      error: `there were errors -- ${stderr.slice(0, 512)}`,
    });
    throw Error(`error syncing home directory -- ${stderr.slice(0, 512)}`);
  } else {
    bootlog({
      project_id,
      type: "copy-home",
      progress: 100,
    });
  }

  bootlog({
    project_id,
    type: "start-sidecar",
    progress: 100,
    desc: "updated home directory",
  });

  return async () => {
    bootlog({ project_id, type: "mutagen-init", progress: 0 });
    await podman([
      "exec",
      sidecarPodName,
      "mutagen",
      "sync",
      "create",
      "--name=upperdir",
      "--mode=one-way-replica",
      "--symlink-mode=posix-raw",
      "--compression=deflate",
      join("/root", upperdir),
      `${servers[0].name}:${upperdir}`,
    ]);
    bootlog({ project_id, type: "mutagen-init", progress: 50 });

    await podman([
      "exec",
      sidecarPodName,
      "mutagen",
      "sync",
      "create",
      "--name=root",
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
    bootlog({ project_id, type: "mutagen-init", progress: 100 });
  };
}

function parseEta(s?: string) {
  if (s == null) {
    return;
  }
  const i = s?.indexOf(":");
  if (i == -1) return;
  const j = s?.lastIndexOf(":");
  return (
    parseInt(s.slice(0, i)) * 1000 * 60 * 60 +
    parseInt(s.slice(i + 1, j)) * 1000 * 60 +
    parseInt(s.slice(j + 1)) * 1000
  );
}
