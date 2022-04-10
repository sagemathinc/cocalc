/*
Create or return the TCP connection from this server to a given project.

The connection is cached and calling this is async debounced, so call it
all you want.
*/

import { reuseInFlight } from "async-await-utils/hof";
import { getProject } from "@cocalc/server/projects/control";
import getLogger from "@cocalc/backend/logger";
import { callback2 } from "@cocalc/util/async-utils";
import initialize from "./initialize";
import { cancelAll } from "./handle-query";

// misc_node is still in coffeescript :-(
//import { connect_to_locked_socket } from "@cocalc/backend/misc_node";
const { connect_to_locked_socket } = require("@cocalc/backend/misc_node");

const logger = getLogger("project-connection:connect");
type Connection = any;

const CACHE: { [project_id: string]: Connection } = {};

const EndEvents = ["end", "close", "error"];

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
  const { host, port, secret_token: token } = await project.address();
  dbg("got ", host, port);

  const socket = await callback2(connect_to_locked_socket, {
    host,
    port,
    token,
  });

  initialize(project_id, socket);

  function free() {
    logger.info("disconnect from ", project_id);
    // don't want free to be triggered more than once.
    for (const evt of EndEvents) {
      socket.removeListener(evt, free);
    }
    delete CACHE[project_id];
    try {
      socket.end();
    } catch (_) {}
    cancelAll(project_id);
  }
  for (const evt of EndEvents) {
    socket.on(evt, free);
  }

  CACHE[project_id] = socket;
  return socket;
}

const getConnection: (project_id: string) => Promise<Connection> =
  reuseInFlight(connect);
export default getConnection;
