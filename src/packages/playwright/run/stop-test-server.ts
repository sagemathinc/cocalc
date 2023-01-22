/*
Start an ephemeral personal hub server and postgresql database server
specifically for playwright automated testing purposes.

PGUSER='smc' PGHOST=`pwd`/../../data/postgres/socket

*/

import { existsSync } from "fs";
import { rm, readFile, unlink } from "fs/promises";
import { kill } from "process";
import debug from "debug";
import spawnAsync from "await-spawn";

const log = debug("test-server");

import { PATH, HUB_PID, PG_DATA } from "./start-test-server";

async function stop(path: string) {
  log("stop", path);
  let pid;
  try {
    pid = parseInt((await readFile(path)).toString());
  } catch (_err) {
    return;
  }
  kill(pid);
  await unlink(path);
}

export async function stopPostgres() {
  try {
    await spawnAsync("pg_ctl", ["stop", "-D", PG_DATA]);
  } catch (_err) {}
}

export function stopHub() {
  stop(HUB_PID);
}

export async function main() {
  if (!existsSync(PATH)) {
    log("no data directory -- nothing to do", PATH);
    return;
  }
  await stopPostgres();
  await stopHub();
  log("deleting data directory", PATH);
  await rm(PATH, { recursive: true });
}

if (require.main === module) {
  main();
}
