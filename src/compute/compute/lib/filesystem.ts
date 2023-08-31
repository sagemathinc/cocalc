/*
Mount a remote CoCalc project's filesystem locally over a websocket using FUSE.

 await require('.').mount({remote:'wss://cocalc.com/10f0e544-313c-4efe-8718-2142ac97ad11/raw/.smc/websocketfs',path:process.env.HOME + '/dev2', connectOptions:{perMessageDeflate: false,  headers: {Cookie: require('cookie').serialize('api_key', 'sk-at7ALcGBKMbzq7Vc00000P')}}})
 
 
*/

import { apiKey, apiServer, apiBasePath } from "@cocalc/backend/data";
import { mount } from "websocketfs";
import getLogger from "@cocalc/backend/logger";
import { project } from "@cocalc/api-client";
import { serialize } from "cookie";

const logger = getLogger("compute:filesystem");

export async function mountProject({
  project_id,
  path, // where to mount the project's HOME directory
}: {
  project_id: string;
  path: string;
}) {
  const log = (...args) => logger.debug(path, ...args);
  log();

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
  const remote = `${protocol}${host}${apiBasePath}${project_id}/raw/.smc/websocketfs`;
  log("connecting to ", remote);
  const headers = { Cookie: serialize("api_key", apiKey) };
  // SECURITY: DO NOT log headers and connectOptions, obviously!
  const connectOptions = { perMessageDeflate: false, headers };

  const { unmount } = await mount({ remote, path, connectOptions });
  return unmount;
}
