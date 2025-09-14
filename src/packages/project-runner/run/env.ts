import { conatServer } from "@cocalc/backend/data";
import { join } from "node:path";
import base_path from "@cocalc/backend/base-path";
import { COCALC_SRC, COCALC_BIN } from "./mounts";
import { executeCode } from "@cocalc/backend/execute-code";

export function dataPath(HOME: string): string {
  return join(HOME, ".cache", "cocalc", "project");
}

// see also packages/project/secret-token.ts
export function secretTokenPath(HOME: string) {
  const data = dataPath(HOME);
  return join(data, "secret-token");
}

export async function getImageEnv(image): Promise<{ [key: string]: string }> {
  try {
    const { stdout } = await executeCode({
      err_on_exit: true,
      verbose: true,
      command: "podman",
      args: [
        "image",
        "inspect",
        image,
        "--format",
        "{{range .Config.Env}}{{println .}}{{end}}",
      ],
    });
    const env: { [key: string]: string } = {};
    for (const line of stdout.split("\n")) {
      const i = line.indexOf("=");
      if (i == -1) continue;
      const key = line.slice(0, i);
      const value = line.slice(i + 1);
      env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

export async function getEnvironment({
  HOME,
  project_id,
  env: extra,
  image,
}: {
  HOME: string;
  project_id: string;
  env?: { [key: string]: string };
  image: string;
}): Promise<{ [key: string]: string }> {
  const extra_env: string = Buffer.from(JSON.stringify(extra ?? {})).toString(
    "base64",
  );

  const imageEnv = await getImageEnv(image);

  const USER = "root";
  const DATA = dataPath(HOME);
  let PATH = `${HOME}/bin:${HOME}/.local/bin:${COCALC_BIN}:${COCALC_SRC}/packages/backend/node_modules/.bin:${imageEnv.PATH ? imageEnv.PATH + ":" : ""}/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`;
  const already = new Set<string>();
  const w: string[] = [];
  for (const segment of PATH.split(":")) {
    if (!already.has(segment)) {
      w.push(segment);
      already.add(segment);
    }
  }
  PATH = w.join(":");

  return {
    ...imageEnv,
    TERM: "xterm",
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
    PATH,
    // For the address, see https://blog.podman.io/2024/10/podman-5-3-changes-for-improved-networking-experience-with-pasta/
    //   "Starting with Podman 5.3 we will use this by default: the address 169.254.1.2 will be mapped to the host. please do not hardcode the IP and use host.containers.internal instead."
    CONAT_SERVER: conatServer.replace("localhost", "host.containers.internal"),
    COCALC_SECRET_TOKEN: secretTokenPath(HOME),
    BASE_PATH: base_path,
  };
}
