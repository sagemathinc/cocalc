/*
Run an interactive bash terminal, but with the nats and nsc command
available and configured to work with full permissions. This is
useful for interactively using those command to inspect the state
of the system, learning how to do something, etc.
*/

import { data, natsPassword, natsUser } from "@cocalc/backend/data";
import { join } from "path";
import { spawnSync } from "node:child_process";
import { natsServerUrl } from "./conf";

function params({ user }) {
  return {
    command: "bash",
    args: ["--norc", "--noprofile"],
    env: {
      NATS_URL: natsServerUrl,
      NATS_PASSWORD: natsPassword,
      NATS_USER: user,
      HOME: process.env.HOME,
      TERM: process.env.TERM,
      PS1: "\\w [nats-cli]$ ",
    },
  };
}

// echo; echo '# Use CoCalc config of NATS (nats and nsc) via this subshell:'; echo; NATS_URL=nats://${COCALC_NATS_SERVER:=localhost}:${COCALC_NATS_PORT:=4222} XDG_DATA_HOME=${COCALC_ROOT:=$INIT_CWD}/data XDG_CONFIG_HOME=${COCALC_ROOT:=$INIT_CWD}/data PATH=${COCALC_ROOT:=$INIT_CWD}/data/nats/bin:$PATH bash

// the supported users here are natsUser and 'sys'.

export function main({ user = natsUser }: { user?: string } = {}) {
  let { command, args, env } = params({ user });
  const PATH0 = join(data, "nats", "bin");
  console.log("# Use CoCalc config of NATS (nats and nsc) via this subshell:");
  console.log(
    JSON.stringify(
      { ...env, NATS_PASSWORD: "xxx", PATH: PATH0 + ":..." },
      undefined,
      2,
    ),
  );
  spawnSync(command, args, {
    env: { ...env, PATH: `${PATH0}:${process.env.PATH}` },
    stdio: "inherit",
  });
}
