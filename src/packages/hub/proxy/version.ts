import Cookies from "cookies";
import { versionCookieName } from "@cocalc/util/consts";
import basePath from "@cocalc/backend/base-path";
import getServerSettings from "../servers/server-settings";
import getLogger from "../logger";

export let minVersion: number = 0;
const logger = getLogger("proxy:version");

// Import to wait until we know the valid min_version before serving.
let initialized = false;
export async function init(): Promise<void> {
  if (initialized) {
    return;
  }
  initialized = true;
  const serverSettings = await getServerSettings();
  minVersion = serverSettings.version.version_min_browser ?? 0;
  serverSettings.table.on("change", () => {
    minVersion = serverSettings.version.version_min_browser ?? 0;
  });
}

// Returns true if the version check **fails**
// If res is not null, sends a message. If it is
// null, just returns true but doesn't send a response.
export function versionCheckFails(req, res?, allowNoCookie = false): boolean {
  if (minVersion == 0) {
    // If no minimal version is set, no need to do further work,
    // since we'll pass it.
    return false;
  }
  const cookies = new Cookies(req);
  /* NOTE: The name of the cookie $VERSION_COOKIE_NAME is
     also used in the frontend code file @cocalc/frontend/set-version-cookie.js
     but everybody imports it from @cocalc/util/consts.
  */
  const rawVal = cookies.get(versionCookieName(basePath));
  if (rawVal == null) {
    if (allowNoCookie) {
      return false;
    }
    return true;
  }
  const version = parseInt(rawVal);
  logger.debug("version check", { version, minVersion });
  if (isNaN(version) || version < minVersion) {
    if (res != null) {
      // status code 4xx to indicate this is a client problem and not
      // 5xx, a server problem
      // 426 means "upgrade required"
      res.writeHead(426, { "Content-Type": "text/html" });
      res.end(
        `426 (UPGRADE REQUIRED): reload CoCalc tab or restart your browser -- version=${version} < minVersion=${minVersion}`,
      );
    }
    return true;
  } else {
    return false;
  }
}
