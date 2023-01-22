/*
Start an ephemeral personal hub server and postgresql database server
specifically for playwright automated testing purposes.

PGUSER='smc' PGHOST=`pwd`/../../data/postgres/socket

*/

import { existsSync } from "fs";
import { appendFile, mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { delay } from "awaiting";
import spawnAsync from "await-spawn";
import debug from "debug";

const log = debug("test-server");

export const PATH = process.env.PLAYWRIGHT_PATH ?? "/tmp/playwright";
export const HUB_PID = join(PATH, "hub.pid");
export const PG_DATA = resolve(join(PATH, "postgres"));

const PORT = parseInt(process.env.PLAYWRIGHT_PORT ?? "9000");

const SOCKET = join(PATH, "socket");

export async function startPostgres() {
  log("start postgres");
  await mkdir(PG_DATA);
  await spawnAsync("pg_ctl", ["init", "-D", PG_DATA]);

  // Lock down authentication so it is ONLY via unix socket
  await writeFile(join(PG_DATA, "pg_hba.conf"), "local all all trust");
  await mkdir(SOCKET);
  await appendFile(
    join(PG_DATA, "postgresql.conf"),
    `\nunix_socket_directories='${SOCKET}'\nlisten_addresses=''\n`
  );
  log("Start database running in background as daemon");
  spawnAsync("pg_ctl", ["start", "-D", PG_DATA]);
  for (let i = 0; i < 5; i++) {
    // Create the smc user with no password -- this should fail
    // once or twice due to postgres not having fully started above.
    try {
      log("creating smc user");
      await spawnAsync("createuser", ["-h", SOCKET, "-sE", "smc"]);
      break;
    } catch (err) {
      log("error creating user", err);
    }
    log("will try again in 1 seconds...");
    await delay(1000);
  }
}

export function startHub() {}

export async function main() {
  log("starting test server");
  if (existsSync(PATH)) {
    throw Error(
      `${PATH} must not exist -- first run 'pnpm exec stop-test-server'`
    );
  }
  log("make ", PATH);
  await mkdir(PATH);
  await startPostgres();
  await startHub();
}

if (require.main === module) {
  main();
}
