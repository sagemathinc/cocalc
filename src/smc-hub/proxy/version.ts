import * as Cookies from "cookies";

import { versionCookieName } from "smc-util/consts";
import base_path from "smc-util-node/base-path";

import getServerSettings from "../servers/server-settings";
import getLogger from "../logger";

let minVersion: number = 0;

const winston = getLogger("proxy: version");

// Import to wait until we know the valid min_version before serving.
export async function init(): Promise<void> {
  const serverSettings = await getServerSettings();
  minVersion = serverSettings.version["min_version"] ?? 0;
  serverSettings.table.on("change", () => {
    minVersion = serverSettings.version["min_version"] ?? 0;
  });
}

// Returns true if the version check **fails**
// If res is not null, sends a message. If it is
// null, just returns true but doesn't send a response.
export function versionCheckFails(req, res?): boolean {
  const cookies = new Cookies(req);
  /* NOTE: The name of the cookie $VERSION_COOKIE_NAME is
     also used in the frontend code file smc-webapp/set-version-cookie.js
     but everybody imports it from smc-util/consts.
  */
  const rawVal = cookies.get(versionCookieName(base_path));
  const version = parseInt(rawVal);
  winston.debug(`version check version=${version}, minVersion=${minVersion}`);
  if (isNaN(version) || version < minVersion) {
    if (res != null) {
      // status code 4xx to indicate this is a client problem and not
      // 5xx, a server problem
      // 426 means "upgrade required"
      res.writeHead(426, { "Content-Type": "text/html" });
      res.end(
        `426 (UPGRADE REQUIRED): reload CoCalc tab or restart your browser -- version=${version} < minVersion=${minVersion}`
      );
    }
    return true;
  } else {
    return false;
  }
}
