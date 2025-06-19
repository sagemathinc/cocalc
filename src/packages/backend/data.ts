/*
Where Data is Stored:

We centralize here determination of all directories on the file system
where data is stored for any of the components of CoCalc, run in any way.

All information here must be determinable when this module is initialized,
e.g., from environment variables or heuristics involving the file system.
In particular, nothing here can be impacted by command line flags
or content of a database.
*/

import Dict = NodeJS.Dict;

const DEFINITION = `CoCalc Environment Variables:
- root -- if COCALC_ROOT is set then it; otherwise use [cocalc-source]/src/.
- data -- if the environment variable DATA is set, use that.  Otherwise, use {root}/data
- pgdata -- if env var PGDATA is set, use that; otherwise, it is {data}/postgres: where data data is stored (if running locally)
- pghost - if env var PGHOST is set, use that; otherwise, it is {data}/postgres/socket: what database connects to
- projects -- If env var PROJECTS is set, use that; otherwise, it is {data}"/projects/[project_id]";
              This is where project home directories are (or shared files for share server), and it MUST
              contain the string "[project_id]".
- secrets -- if env var SECRETS is set, use that; otherwise, it is {data}/secrets:  where to store secrets
- logs -- if env var LOGS is set, use that; otherwise, {data}/logs:  directory in which to store logs
`;

import { join, resolve } from "path";
import { ConnectionOptions } from "node:tls";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { isEmpty } from "lodash";
import basePath from "@cocalc/backend/base-path";
import port from "@cocalc/backend/port";

function determineRootFromPath(): string {
  const cur = __dirname;
  const search = "/src/";
  const i = cur.lastIndexOf(search);
  const root = resolve(cur.slice(0, i + search.length - 1));
  process.env.COCALC_ROOT = root;
  return root;
}

// Each field value in this interface is to be treated as though it originated from a raw
// environment variable. These environment variables are used to configure CoCalc's SSL connection
// to the database.
//
interface CoCalcSSLEnvConfig extends Dict<string> {
  SMC_DB_SSL?: string;
  SMC_DB_SSL_CA_FILE?: string;
  SMC_DB_SSL_CLIENT_CERT_FILE?: string;
  SMC_DB_SSL_CLIENT_KEY_FILE?: string;
  SMC_DB_SSL_CLIENT_KEY_PASSPHRASE?: string;
}

// This interface is used to specify environment variables to be passed to the "psql" command for
// SSL configuration.
//
// See https://www.postgresql.org/docs/current/libpq-envars.html for more information.
//
export interface PsqlSSLEnvConfig {
  // We could also add "verify-ca" here, but it's probably best to assume that we'd like the
  // most secure option out of the box. The differences between "verify-ca" and "verify-full"
  // can be found here: https://www.postgresql.org/docs/current/libpq-ssl.html#LIBPQ-SSL-CLIENTCERT
  //
  PGSSLMODE?: "verify-full" | "require";
  // This typing is redundant but included for clarity.
  //
  PGSSLROOTCERT?: "system" | string;
  PGSSLCERT?: string;
  PGSSLKEY?: string;
}

// A full list of property types and SSL config options can be found here:
//
// http://nodejs.org/api/tls.html#tls_tls_connect_options_callback
//
// We extend the existing ConnectionOptions interface to include certificate file paths, since these
// are used when connecting to Postgres outside of Node (e.g., for raw psql queries).
//
export type SSLConfig =
  | (ConnectionOptions & {
      caFile?: string;
      clientCertFile?: string;
      clientKeyFile?: string;
    })
  | boolean
  | undefined;

/**
 * Converts an environment-variable-driven SSLEnvConfig into a superset of the SSL context expected
 * by node when generating SSL connections.
 *
 * @param env
 */
export function sslConfigFromCoCalcEnv(
  env: CoCalcSSLEnvConfig = process.env,
): SSLConfig {
  const sslConfig: SSLConfig = {};

  if (env.SMC_DB_SSL_CA_FILE) {
    sslConfig.caFile = env.SMC_DB_SSL_CA_FILE;
    sslConfig.ca = readFileSync(env.SMC_DB_SSL_CA_FILE);
  }

  if (env.SMC_DB_SSL_CLIENT_CERT_FILE) {
    sslConfig.clientCertFile = env.SMC_DB_SSL_CLIENT_CERT_FILE;
    sslConfig.cert = readFileSync(env.SMC_DB_SSL_CLIENT_CERT_FILE);
  }

  if (env.SMC_DB_SSL_CLIENT_KEY_FILE) {
    sslConfig.clientKeyFile = env.SMC_DB_SSL_CLIENT_KEY_FILE;
    sslConfig.key = readFileSync(env.SMC_DB_SSL_CLIENT_KEY_FILE);
  }

  if (env.SMC_DB_SSL_CLIENT_KEY_PASSPHRASE) {
    sslConfig.passphrase = env.SMC_DB_SSL_CLIENT_KEY_PASSPHRASE;
  }

  return isEmpty(sslConfig)
    ? env.SMC_DB_SSL?.toLowerCase() === "true"
    : sslConfig;
}

/**
 * Converts a provided SSLConfig object into (a subset of) its corresponding `psql` environment
 * variables. See
 *
 * http://nodejs.org/api/tls.html#tls_tls_connect_options_callback
 *
 * for more information about these options.
 *
 * @param config
 */
export function sslConfigToPsqlEnv(config: SSLConfig): PsqlSSLEnvConfig {
  if (!config) {
    return {};
  } else if (config === true) {
    return {
      PGSSLMODE: "require",
    };
  }

  // If SSL config is anything other than a boolean, require CA validation
  //
  const psqlArgs: PsqlSSLEnvConfig = {
    PGSSLMODE: "verify-full",
  };

  // Server CA. Uses CA file when provided and system certs otherwise.
  //
  if (config.caFile) {
    psqlArgs.PGSSLROOTCERT = `${config.caFile}`;
  } else {
    psqlArgs.PGSSLROOTCERT = "system";
  }

  // Client cert
  //
  if (config.clientCertFile) {
    psqlArgs.PGSSLCERT = `${config.clientCertFile}`;
  }

  // Client key
  //
  if (config.clientKeyFile) {
    psqlArgs.PGSSLKEY = `${config.clientKeyFile}`;
  }

  return psqlArgs;
}

export const root: string = process.env.COCALC_ROOT ?? determineRootFromPath();
export const data: string = process.env.DATA ?? join(root, "data");
export const pguser: string = process.env.PGUSER ?? "smc";
export const pgdata: string = process.env.PGDATA ?? join(data, "postgres");
export const pghost: string = process.env.PGHOST ?? join(pgdata, "socket");
export const pgssl = sslConfigFromCoCalcEnv();
export const pgdatabase: string =
  process.env.SMC_DB ?? process.env.PGDATABASE ?? "smc";
export const projects: string =
  process.env.PROJECTS ?? join(data, "projects", "[project_id]");
export const secrets: string = process.env.SECRETS ?? join(data, "secrets");

export const syncFiles = {
  // Persistent local storage of streams and kv's as sqlite3 files
  local: process.env.COCALC_SYNC ?? join(data, "sync"),
  // Archived storage of streams and kv's as sqlite3 files, if set.
  // This could be a gcsfuse mountpoint.
  archive: process.env.COCALC_SYNC_ARCHIVE ?? "",
};

// if the directory secrets doesn't exist, create it (sync, during this load):
if (!existsSync(secrets)) {
  try {
    // Mode '0o700' allows read/write/execute only for the owner
    mkdirSync(secrets, { recursive: true, mode: 0o700 });
  } catch {
    // non-fatal, e.g., maybe user doesn't even have write access to the secrets path
  }
}

export const logs: string = process.env.LOGS ?? join(data, "logs");

// CONAT server and password
export let conatServer =
  process.env.CONAT_SERVER ??
  `http://localhost:${port}${basePath.length > 1 ? basePath : ""}`;
if (conatServer.split("//").length > 2) {
  // i make this mistake too much
  throw Error(
    `env variable CONAT_SERVER invalid -- too many /s' --'${process.env.CONAT_SERVER}'`,
  );
}

export function setConatServer(server: string) {
  conatServer = server;
}

// Password used by hub (not users or projects) to connect to a Conat server:
export let conatPassword = "";
export const conatPasswordPath = join(secrets, "conat-password");
try {
  conatPassword = readFileSync(conatPasswordPath).toString().trim();
} catch {}
export function setConatPassword(password: string) {
  conatPassword = password;
}

export let conatValkey: string = process.env.CONAT_VALKEY ?? "";
export function setConatValkey(valkey: string) {
  conatValkey = valkey;
}

export let valkeyPassword = "";
const valkeyPasswordPath = join(secrets, "valkey-password");
try {
  valkeyPassword = readFileSync(valkeyPasswordPath).toString().trim();
} catch {}

export let conatSocketioCount = parseInt(
  process.env.CONAT_SOCKETIO_COUNT ?? "1",
);

// number of persist servers (if configured to run)
export let conatPersistCount = parseInt(process.env.CONAT_PERSIST_COUNT ?? "1");

// number of api servers (if configured to run)
export let conatApiCount = parseInt(process.env.CONAT_API_COUNT ?? "1");

// if configured, will create a socketio cluster using
// the cluster adapter, listening on the given port.
// It makes no sense to use both this *and* valkey. It's
// one or the other.
export let conatClusterPort = parseInt(process.env.CONAT_CLUSTER_PORT ?? "0");

// API keys

export let apiKey: string = process.env.API_KEY ?? "";
export let apiServer: string = process.env.API_SERVER ?? "";

// Delete API_KEY from environment to reduce chances of it leaking, e.g., to
// spawned terminal subprocess.
// Important note: It's critical that only one version of the @cocalc/backend
// package is being used, or some parts of the code will get the API_KEY and
// others will not.
delete process.env.API_KEY;

export function setApi({ key, server }: { key?: string; server?: string }) {
  if (key != null) {
    apiKey = key;
  }
  if (server != null) {
    checkApiServer(server);
    apiServer = server;
  }
}

function sanityChecks() {
  // Do a sanity check on projects:
  if (!projects.includes("[project_id]")) {
    throw Error(
      `${DEFINITION}\n\nenv variable PROJECTS must contain "[project_id]" but it is "${process.env.PROJECTS}"`,
    );
  }
  checkApiServer(apiServer);
}

function checkApiServer(server) {
  if (!server) return;
  if (server.endsWith("/")) {
    throw Error("API_SERVER must not end in /");
  }
  if (!server.startsWith("http://") && !server.startsWith("https://")) {
    throw Error("API_SERVER must start with http:// or https://");
  }
}

sanityChecks();
