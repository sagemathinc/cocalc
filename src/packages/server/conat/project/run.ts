/*
Project run server.

It may be necessary to do this to enable the user running this
code to use nsjail:

    sudo sysctl -w kernel.apparmor_restrict_unprivileged_unconfined=0 && sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0

See https://github.com/google/nsjail/issues/236#issuecomment-2267096267



---

DEV

 Turn off in the hub by sending this message from a browser as an admin:

   await cc.client.conat_client.hub.system.terminate({service:'project-runner'})

Then start this in nodejs

   require('@cocalc/server/conat/project/run').init()
*/

import { conat } from "@cocalc/backend/conat";
import { server as projectRunnerServer } from "@cocalc/conat/project/runner/run";
import { isValidUUID } from "@cocalc/util/misc";
import { loadConatConfiguration } from "../configuration";
import { getProject } from "@cocalc/server/projects/control";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";
import { root } from "@cocalc/backend/data";
import { dirname } from "node:path";
import { userInfo } from "node:os";
import {
  chown,
  ensureConfFilesExists,
  getEnvironment,
  homePath,
  setupDataPath,
  writeSecretToken,
} from "@cocalc/server/projects/control/util";
import { mkdir } from "fs/promises";
import { getProjectSecretToken } from "@cocalc/server/projects/control/secret-token";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { spawn } from "node:child_process";
import { type Configuration } from "./types";
import { limits } from "./limits";

const DEFAULT_UID = 2001;

const logger = getLogger("server:conat:project:run");

let servers: any[] = [];

const children: { [project_id: string]: any } = {};

export async function setProjectState({ project_id, state }) {
  try {
    const p = await getProject(project_id);
    await p.saveStateToDatabase({ state });
  } catch {}
}

async function touch(project_id) {
  try {
    const p = await getProject(project_id);
    await p.touch(undefined, { noStart: true });
  } catch {}
}

const MOUNTS = {
  "-R": ["/etc", "/var", "/bin", "/lib", "/usr", "/lib64"],
  "-B": ["/dev"],
};

async function initMounts() {
  for (const type in MOUNTS) {
    const v: string[] = [];
    for (const path of MOUNTS[type]) {
      if (await exists(path)) {
        v.push(path);
      }
    }
    MOUNTS[type] = v;
  }
  MOUNTS["-R"].push(`${dirname(root)}:/cocalc`);
}

async function start({
  project_id,
  config,
}: {
  project_id: string;
  config?: Configuration;
}) {
  if (!isValidUUID(project_id)) {
    throw Error("start: project_id must be valid");
  }
  logger.debug("start", { project_id, config });
  setProjectState({ project_id, state: "starting" });
  if (children[project_id] != null && children[project_id].exitCode == null) {
    logger.debug("start -- already running");
    return;
  }
  let uid, gid;
  if (userInfo().uid) {
    // server running as non-root user -- single user mode
    uid = gid = userInfo().uid;
  } else {
    // server is running as root -- multiuser mode
    uid = gid = DEFAULT_UID;
  }

  const home = homePath(project_id);
  await mkdir(home, { recursive: true });
  await chown(home, uid);
  await ensureConfFilesExists(home, uid);
  const env = await getEnvironment(project_id);
  const cwd = "/cocalc/src/packages/project";
  await setupDataPath(home, uid);
  await writeSecretToken(home, await getProjectSecretToken(project_id), uid);

  let cmd: string, args: string[];
  if (config?.admin) {
    // DANGEROUS: We do arbitrarily dangerous things here!
    // This is, e.g., needed to run nsjail in nsjail,
    // which is needed for development of cocalc inside cocalc.
    // It sets things up so its possible to use nsjail
    // from inside a jail, i.e., nested jailing.
    cmd = "unshare";
    const shellScript = `
      mount --bind ${home} ${env.HOME} && \
      exec ${process.execPath} ./bin/cocalc-project.js --init project_init.sh
    `;
    args = ["--mount", "bash", "-c", shellScript];
  } else {
    args = [
      "-q",
      "-Mo",
      "--hostname",
      `project-${env.COCALC_PROJECT_ID}`,
      "--disable_clone_newnet",
      "--keep_env",
      "--cwd",
      cwd,
      "--keep_caps",
      "--skip_setsid",
    ];

    if (uid != null && gid != null) {
      args.push("-u", `${uid}`, "-g", `${gid}`);
    }

    for (const type in MOUNTS) {
      for (const path of MOUNTS[type]) {
        args.push(type, path);
      }
    }
    // need a /tmp directory
    args.push("-m", "none:/tmp:tmpfs:size=500000000");

    args.push("-B", `${home}:${env.HOME}`);
    args.push(...limits(config));

    args.push(
      "--",
      process.execPath,
      "./bin/cocalc-project.js",
      "--init",
      "project_init.sh",
    );
    cmd = "nsjail";
  }
  //logEnv(env);
  console.log(`${cmd} ${args.join(" ")}`);
  const child = spawn(cmd, args, {
    env,
    cwd,
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

  touch(project_id);
  setProjectState({ project_id, state: "running" });
}

async function stop({ project_id }) {
  if (!isValidUUID(project_id)) {
    throw Error("stop: project_id must be valid");
  }
  logger.debug("stop", { project_id });
  if (children[project_id] != null && children[project_id].exitCode == null) {
    setProjectState({ project_id, state: "stopping" });
    children[project_id]?.kill("SIGKILL");
    delete children[project_id];
  }
  setProjectState({ project_id, state: "opened" });
}

async function status({ project_id }) {
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
  setProjectState({ project_id, state });
  return { state };
}

export async function init(count: number = 1) {
  await initMounts();
  await loadConatConfiguration();
  for (let i = 0; i < count; i++) {
    const server = await projectRunnerServer({
      client: conat(),
      start: reuseInFlight(start),
      stop: reuseInFlight(stop),
      status: reuseInFlight(status),
    });
    servers.push(server);
  }
}

export function close() {
  for (const project_id in children) {
    logger.debug(`killing project_id=${project_id}`);
    children[project_id]?.kill("SIGKILL");
    delete children[project_id];
  }
  for (const server of servers) {
    server.close();
  }
  servers.length = 0;
}

// important to close, because it kills all the processes that were spawned
process.once("exit", close);
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    process.exit();
  });
});

// function logEnv(env) {
//   let s = "export ";
//   for (const key in env) {
//     s += `${key}="${env[key]}" `;
//   }
//   console.log(s);
// }
