/*
Create or return the TCP connection from this server to a given project.

The connection is cached and calling this is async debounced, so call it
all you want.
*/

import { reuseInFlight } from "async-await-utils/hof";
import { getProject } from "@cocalc/server/projects/control";
import getLogger from "@cocalc/backend/logger";
import { callback2 } from "@cocalc/util/async-utils";

// misc_node is still in coffeescript :-(
//import { connect_to_locked_socket } from "@cocalc/backend/misc_node";
const { connect_to_locked_socket } = require("@cocalc/backend/misc_node");

const logger = getLogger("project-connection:connect");
type Connection = any;

const CACHE: { [project_id: string]: Connection } = {};

async function connect(project_id: string): Promise<Connection> {
  logger.info("connect to ", project_id);
  const dbg = (...args) => logger.debug(project_id, ...args);
  if (CACHE[project_id]) {
    dbg("got ", project_id, " from cache");
    return CACHE[project_id];
  }

  const project = getProject(project_id);

  // Calling address starts the project running, then returns
  // information about where it is running and how to connection.
  dbg("getting address of ", project_id);
  const address = await project.address();
  dbg("got ", address.host, address.port); // address itself contains secret_token, which we should not log

  const socket = await callback2(connect_to_locked_socket, address);

  initialize(socket);
  CACHE[project_id] = socket;
  return socket;
}

const getConnection: (project_id: string) => Promise<Connection> =
  reuseInFlight(connect);
export default getConnection;
