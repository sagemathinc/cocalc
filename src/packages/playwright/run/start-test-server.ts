/*
Start an ephemeral personal hub server and postgresql database server
specifically for playwright automated testing purposes.
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
  spawnAsync("pg_ctl", ["start", "-D", PG_DATA]); // do NOT await this
  await delay(250);
  for (let i = 0; i < 5; i++) {
    // Create the smc user with no password -- this should fail
    // once or twice due to postgres not having fully started above.
    try {
      log("creating smc user");
      await spawnAsync("createuser", ["-h", SOCKET, "-sE", "smc"]);
      break;
    } catch (err) {
      log("error creating user", `${err}`);
    }
    log("will try again in 0.5 seconds...");
    await delay(500);
  }
  log("finished starting postgres");
}

/* unset DATA COCALC_ROOT BASE_PATH && PORT=5500 PGUSER='smc' PGHOST=`pwd`/../../data/postgres/socket DEBUG='cocalc:*,-cocalc:silly:*',$DEBUG NODE_ENV=production NODE_OPTIONS='--max_old_space_size=16000' pnpm cocalc-hub-server --mode=single-user --personal --all --hostname=localhost
 */
export async function startHub() {
  log("starting hub");
  const cwd = resolve(join(__dirname, "..", "..", "..", "hub"));
  const env = {
    ...process.env,
    PORT: `${PORT}`,
    NODE_ENV: "production",
    PGUSER: "smc",
    PGHOST: SOCKET,
    DATA: join(PATH, "data"),
    DEBUG: "cocalc:*,-cocalc:silly:*",
    NODE_OPTIONS: "--max_old_space_size=16000",
  };
  delete env["BASE_PATH"];
  delete env["COCALC_ROOT"];
  delete env["COCALC_PROJECT_ID"];
  log("spawning cocalc-hub-server");
  const args = [
    "cocalc-hub-server",
    "--mode=single-user",
    "--personal",
    "--all",
    "--hostname=localhost",
  ];
  log("pnpm", args.join(" "));
  const response = spawnAsync("pnpm", args, {
    cwd,
    env,
    detached: true,
    stdio: process.env.VERBOSE ? "inherit" : undefined,
  });
  if (response.child.pid) {
    log("spawned hub with pid=", response.child.pid);
    await writeFile(HUB_PID, `${response.child.pid}`);
  }
}

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
  log("started services");
  process.exit(0); // because of some state left from "pg_ctl start"
}

if (require.main === module) {
  main();
}
