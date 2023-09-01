/*
Mount a remote CoCalc project's filesystem locally over a websocket using FUSE.

 await require('.').mount({remote:'wss://cocalc.com/10f0e544-313c-4efe-8718-2142ac97ad11/raw/.smc/websocketfs',path:process.env.HOME + '/dev2', connectOptions:{perMessageDeflate: false,  headers: {Cookie: require('cookie').serialize('api_key', 'sk-at7ALcGBKMbzq7Vc00000P')}}})


*/

import { apiKey, apiServer, apiBasePath } from "@cocalc/backend/data";
import { mount } from "websocketfs";
import getLogger from "@cocalc/backend/logger";
import { project } from "@cocalc/api-client";
import { serialize } from "cookie";
import { join } from "path";
import { API_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";

const logger = getLogger("compute:filesystem");

interface Options {
  // which project -- defaults to process.env.PROJECT_ID, which must be given if this isn't
  project_id?: string;
  // path to mount at -- defaults to '/home/user'
  path?: string;
}

export async function mountProject({
  project_id = process.env.PROJECT_ID,
  path = "/home/user", // where to mount the project's HOME directory
}: Options = {}) {
  const log = (...args) => logger.debug(path, ...args);
  log();

  if (!project_id) {
    throw Error("project_id or process.env.PROJECT_ID must be given");
  }

  // Ping to start the project:
  await project.ping({ project_id });

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
  const remote = `${protocol}${host}${join(
    apiBasePath,
    project_id,
    "raw/.smc/websocketfs",
  )}`;
  log("connecting to ", remote);
  const headers = { Cookie: serialize(API_COOKIE_NAME, apiKey) };
  // SECURITY: DO NOT log headers and connectOptions, obviously!
  const connectOptions = { perMessageDeflate: false, headers };

  const { unmount } = await mount({ remote, path, connectOptions });
  return unmount;
}
