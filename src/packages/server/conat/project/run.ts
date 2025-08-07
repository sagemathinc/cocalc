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

   a = require('@cocalc/server/conat/project/run'); await a.init()

   // when done:
   a.close()




*/

import { conat } from "@cocalc/backend/conat";
import { server as projectRunnerServer } from "@cocalc/conat/project/runner/run";
import { isValidUUID } from "@cocalc/util/misc";
import { loadConatConfiguration } from "../configuration";
import { getProject } from "@cocalc/server/projects/control";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";
import { root } from "@cocalc/backend/data";
import { join } from "node:path";
import {
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
import which from "which";
//import { projects } from "@cocalc/backend/data";

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
  "-R": [
    "/cocalc",
    "/etc",
    "/var",
    "/bin",
    "/lib",
    "/usr",
    "/lib64",
    process.env.HOME,
  ],
  "-B": ["/dev"],
} as const;

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
}

let pnpm: string | undefined = undefined;
async function getPnpmPath(): Promise<string> {
  pnpm ??= await which("pnpm");
  return pnpm!;
}

async function start({
  project_id,
  config,
}: {
  project_id: string;
  config?: any;
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
  const home = homePath(project_id);
  await mkdir(home, { recursive: true });
  await ensureConfFilesExists(home);
  const env = await getEnvironment(project_id);
  const cwd = join(root, "packages/project");
  await setupDataPath(home);
  await writeSecretToken(home, await getProjectSecretToken(project_id));

  const args = [
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
    "--disable_rlimits",
  ];
  let uid, gid;
  if (config?.uid != null) {
    uid = config?.uid;
    gid = config?.gid ?? uid;
    args.push("-u", `${uid}`, "-g", `${gid}`);
  } else {
    uid = gid = undefined;
  }

  if (config?.admin) {
    // this is, e.g., needed to run nsjail in nsjail,
    // which is needed for development of cocalc inside cocalc.
    args.push("--proc_rw");
    args.push("-B", "/");
  } else {
    for (const type in MOUNTS) {
      for (const path of MOUNTS[type]) {
        args.push(type, path);
      }
    }
    // need a /tmp directory
    args.push("-m", "none:/tmp:tmpfs:size=500000000");
  }

  args.push("-B", `${home}:${env.HOME}`);

  args.push(
    "--",
    await getPnpmPath(),
    "cocalc-project",
    "--init",
    "project_init.sh",
  );
  const cmd = "nsjail";
  console.log(`${cmd} ${args.join(" ")}`);
  const child = spawn(cmd, args, {
    env,
    cwd,
    uid,
    gid: uid,
  });
  children[project_id] = child;
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
