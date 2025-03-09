/*
Run an interactive bash terminal, but with the nats and nsc command
available and configured to work with full permissions. This is
useful for interactively using those command to inspect the state
of the system, learning how to do something, etc.
*/

import { data } from "@cocalc/backend/data";
import { join } from "path";
import { spawnSync } from "node:child_process";
import { natsServerUrl } from "./conf";

function params() {
  return {
    command: "bash",
    args: ["--norc", "--noprofile"],
    env: {
      NATS_URL: natsServerUrl,
      // I really really don't like having XDG_DATA_HOME here and if you do
      // random stuff in this CLI it ends up in data in some cases.  BUT, I can't
      // find any way around having to set this without having to pass long
      // extra options to the nsc or nats commands...
      XDG_DATA_HOME: data,
      XDG_CONFIG_HOME: data,
      HOME: process.env.HOME,
      PS1: "\\w [nats-cli]$ ",
    },
  };
}

// echo; echo '# Use CoCalc config of NATS (nats and nsc) via this subshell:'; echo; NATS_URL=nats://${COCALC_NATS_SERVER:=localhost}:${COCALC_NATS_PORT:=4222} XDG_DATA_HOME=${COCALC_ROOT:=$INIT_CWD}/data XDG_CONFIG_HOME=${COCALC_ROOT:=$INIT_CWD}/data PATH=${COCALC_ROOT:=$INIT_CWD}/data/nats/bin:$PATH bash

export function main() {
  let { command, args, env } = params();
  const PATH0 = join(data, "nats", "bin");
  console.log("# Use CoCalc config of NATS (nats and nsc) via this subshell:");
  console.log(JSON.stringify({ ...env, PATH: PATH0 + ":..." }, undefined, 2));
  spawnSync(command, args, {
    env: { ...env, PATH: `${PATH0}:${process.env.PATH}` },
    stdio: "inherit",
  });
}
