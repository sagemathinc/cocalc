import { conatServer } from "@cocalc/backend/data";
import { join } from "node:path";
import base_path from "@cocalc/backend/base-path";

export function dataPath(HOME: string): string {
  return join(HOME, ".cache", "cocalc", "project");
}

// see also packages/project/secret-token.ts
export function secretTokenPath(HOME: string) {
  const data = dataPath(HOME);
  return join(data, "secret-token");
}

const ENV_VARS_DELETE = [
  "PGDATA",
  "PGHOST",
  "PGUSER",
  "PGDATABASE",
  "PROJECTS",
  "BASE_PATH",
  "PORT",
  "DATA",
  "LOGS",
  "PWD",
  "LINES",
  "COLUMNS",
  "LS_COLORS",
  "INIT_CWD",
  "DEBUG_FILE",
  "SECRETS",
] as const;

function sanitizedEnv(env: { [key: string]: string | undefined }): {
  [key: string]: string;
} {
  const env2 = { ...env };
  // Remove some potentially confusing env variables
  for (const key of ENV_VARS_DELETE) {
    delete env2[key];
  }
  // Comment about stripping things starting with /root:
  // These tend to creep in as npm changes, e.g., 'npm_config_userconfig' is
  // suddenly /root/.npmrc, and due to permissions this will break starting
  // projects with a mysterious "exit code 243" and no further info, which
  // is really hard to track down.
  for (const key in env2) {
    if (
      key.startsWith("npm_") ||
      key.startsWith("COCALC_") ||
      key.startsWith("CONAT_") ||
      key.startsWith("PNPM_") ||
      key.startsWith("__NEXT") ||
      key.startsWith("NODE_") ||
      env2[key]?.startsWith("/root") ||
      env2[key] == null
    ) {
      delete env2[key];
    }
  }
  return env2 as { [key: string]: string };
}

export function getEnvironment({
  HOME,
  project_id,
  env: extra,
}: {
  HOME: string;
  project_id: string;
  env?: { [key: string]: string };
}): { [key: string]: string } {
  const extra_env: string = Buffer.from(JSON.stringify(extra ?? {})).toString(
    "base64",
  );

  // we only support "user" as the username here:
  const USER = "user";
  const DATA = dataPath(HOME);

  return {
    ...sanitizedEnv(process.env),
    ...{
      HOME,
      DATA,
      LOGS: DATA,
      // DEBUG: so interesting stuff gets logged, but not too much unless we really need it.
      DEBUG: "cocalc:*,-cocalc:silly:*",
      // important to explicitly set the COCALC_ vars since server env has own in a project
      COCALC_PROJECT_ID: project_id,
      COCALC_USERNAME: USER,
      USER,
      COCALC_EXTRA_ENV: extra_env,
      // probably want to be more careful with PATH
      PATH: `${HOME}/bin:${HOME}/.local/bin:${process.env.PATH}`,
      CONAT_SERVER: conatServer,
      COCALC_SECRET_TOKEN: secretTokenPath(HOME),
      BASE_PATH: base_path,
    },
  };
}
