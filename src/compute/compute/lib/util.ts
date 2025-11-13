import { promisify } from "util";
import { delay } from "awaiting";
import getLogger from "@cocalc/backend/logger";
import { apiServer } from "@cocalc/backend/data";
import { join } from "path";
import { project } from "@cocalc/api-client";

const logger = getLogger("compute:util");
const exec = promisify(require("child_process").exec);

export async function getFilesystemType(path: string): Promise<string | null> {
  try {
    const { stdout } = await exec(`df -T ${path} | awk 'NR==2 {print \$2}'`);
    return stdout.trim();
  } catch (error) {
    logger.error(`getFilesystemType -- WARNING -- exec error: ${error}`);
    return null;
  }
}

export async function waitUntilFilesystemIsOfType(path: string, type: string) {
  let d = 500;
  while (true) {
    const cur = await getFilesystemType(path);
    if (cur == type) {
      return;
    }
    logger.debug(
      `getFilesystemType: '${path}' of type '${cur}'.  Waiting for type '${type}'...`,
    );
    await delay(d);
    d = Math.min(3000, d * 1.3);
  }
}

export function getProjectWebsocketUrl(project_id: string) {
  let protocol, host;
  if (apiServer.startsWith("https://")) {
    protocol = "wss://";
    host = apiServer.slice("https://".length);
  } else if (apiServer.startsWith("http://")) {
    protocol = "ws://";
    host = apiServer.slice("http://".length);
  } else {
    throw Error("API_SERVER must start with http:// or https://");
  }
  const remote = `${protocol}${host}/${join(project_id, "raw/.smc")}`;
  return remote;
}

export async function pingProjectUntilSuccess(project_id: string) {
  let d = 2000;
  while (true) {
    try {
      await project.ping({ project_id });
      return;
    } catch (err) {
      logger.debug(
        `pingProjectUntilSuccess: '${project_id}' failed (${err}).  Will try again in ${d}ms...`,
      );
    }
    await delay(d);
    d = Math.min(7000, d * 1.2);
  }
}
