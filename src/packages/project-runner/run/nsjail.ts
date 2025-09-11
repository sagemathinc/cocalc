/*
Runner based on nsjail.


It may be necessary to do this to enable the user running this
code to use nsjail:

    sudo sysctl -w kernel.apparmor_restrict_unprivileged_unconfined=0 && sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0


See https://github.com/google/nsjail/issues/236#issuecomment-2267096267

To make permanent:

echo -e "kernel.apparmor_restrict_unprivileged_unconfined=0\nkernel.apparmor_restrict_unprivileged_userns=0" | sudo tee /etc/sysctl.d/99-custom.conf && sudo sysctl --system
*/

import { nsjail } from "@cocalc/backend/sandbox/install";
import getLogger from "@cocalc/backend/logger";
import { nodePath } from "./mounts";
import { isValidUUID } from "@cocalc/util/misc";
import { root } from "@cocalc/backend/data";
import { join } from "node:path";
import { userInfo } from "node:os";
import { ensureConfFilesExists, setupDataPath, writeSecretToken } from "./util";
import { getEnvironment } from "./env";
import { mkdir } from "fs/promises";
import { spawn } from "node:child_process";
import { type Configuration } from "./types";
export { type Configuration };
import { limits } from "./limits";
import { once } from "@cocalc/util/async-utils";
import { getMounts } from "./mounts";
import { mountHome, setQuota } from "./filesystem";

// for development it may be useful to just disable using nsjail namespaces
// entirely -- change this to true to do so.
const DISABLE_NSJAIL = false;

const DEFAULT_UID = 2001;

// how long from SIGTERM until SIGKILL
const GRACE_PERIOD = 3000;

const logger = getLogger("project-runner:nsjail");
const children: { [project_id: string]: any } = {};

export async function start({
  project_id,
  config,
}: {
  project_id: string;
  config?: Configuration;
}) {
  if (!isValidUUID(project_id)) {
    throw Error("start: project_id must be valid");
  }
  logger.debug("start", { project_id, config: { ...config, secret: "xxx" } });
  if (children[project_id] != null && children[project_id].exitCode == null) {
    logger.debug("start -- already running");
    return;
  }
  let uid, gid;
  if (userInfo().uid) {
    // server running as non-root user -- single user mode
    ({ uid, gid } = userInfo());
  } else {
    // server is running as root -- multiuser mode
    uid = gid = DEFAULT_UID;
  }

  const home = await mountHome(project_id);
  await mkdir(home, { recursive: true });
  await ensureConfFilesExists(home);
  const env = getEnvironment({
    project_id,
    env: config?.env,
    HOME: home,
  });
  await setupDataPath(home);
  if (config?.secret) {
    await writeSecretToken(home, config.secret);
  }

  if (config?.disk) {
    // TODO: maybe this should be done in parallel with other things
    // to make startup time slightly faster (?) -- could also be incorporated
    // into mount.
    await setQuota(project_id, config.disk);
  }

  let script: string,
    cmd: string,
    args: string[] = [];
  if (DISABLE_NSJAIL) {
    // DANGEROUS: no safety at all here!
    // This may be useful in some environments, especially for debugging.
    cmd = process.execPath;
    script = join(root, "packages/project/bin/cocalc-project.js");
  } else {
    script = "/cocalc/src/packages/project/bin/cocalc-project.js";
    args.push(
      "-q", // not too verbose
      "-Mo", // run a command once
      "--disable_clone_newnet", // [ ] TODO: for now we have the full host network
      "--keep_env", // this just keeps env
      "--keep_caps", // [ ] TODO: maybe NOT needed!
      "--skip_setsid", // evidently needed for terminal signals (e.g., ctrl+z); dangerous.  [ ] TODO -- really needed?
    );

    args.push("--hostname", `project-${env.COCALC_PROJECT_ID}`);

    if (uid != null && gid != null) {
      args.push("-u", `${uid}`, "-g", `${gid}`);
    }

    const MOUNTS = await getMounts();
    for (const type in MOUNTS) {
      for (const path of MOUNTS[type]) {
        args.push(type, path);
      }
    }
    // need a /tmp directory
    args.push("-m", "none:/tmp:tmpfs:size=500000000");
    args.push("-B", `${home}:${env.HOME}`);
    args.push(...limits(config));
    args.push("--");
    args.push(nodePath);
    cmd = nsjail;
  }

  args.push(script, "--init", "project_init.sh");

  //logEnv(env);
  // console.log(`${cmd} ${args.join(" ")}`);
  logger.debug(`${cmd} ${args.join(" ")}`);
  const child = spawn(cmd, args, {
    env,
    uid,
    gid: uid,
  });
  children[project_id] = child;

  child.stdout.on("data", (chunk: Buffer) => {
    logger.debug(`project_id=${project_id}.stdout: `, chunk.toString());
  });
  child.stderr.on("data", (chunk: Buffer) => {
    logger.debug(`project_id=${project_id}.stderr: `, chunk.toString());
  });
}

export async function stop({ project_id }) {
  if (!isValidUUID(project_id)) {
    throw Error("stop: project_id must be valid");
  }
  logger.debug("stop", { project_id });
  const child = children[project_id];
  if (child != null && child.exitCode == null) {
    const exit = once(child, "exit", GRACE_PERIOD);
    child.kill("SIGTERM");
    try {
      await exit;
    } catch {
      const exit2 = once(child, "exit");
      child.kill("SIGKILL");
      await exit2;
    }
    delete children[project_id];
  }
}

export async function status({ project_id }) {
  if (!isValidUUID(project_id)) {
    throw Error("status: project_id must be valid");
  }
  logger.debug("status", { project_id });
  let state;
  if (children[project_id] == null || children[project_id].exitCode) {
    state = "opened";
  } else {
    state = "running";
  }
  // [ ] TODO: ip -- need to figure out the networking story for running projects
  // The following will only work on a single machine with global network address space
  return { state, ip: "127.0.0.1" };
}

export function close() {
  for (const project_id in children) {
    logger.debug(`killing project_id=${project_id}`);
    children[project_id]?.kill("SIGKILL");
    delete children[project_id];
  }
}

// important because it kills all
// the processes that were spawned
process.once("exit", close);
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    process.exit();
  });
});
