/*
Create or return the TCP connection from this server to a given project.

The connection is cached and calling this is async debounced, so call it
all you want.

This will also try to start the project up to about a minute.
*/

import { reuseInFlight } from "async-await-utils/hof";
import { getProject } from "@cocalc/server/projects/control";
import getLogger from "@cocalc/backend/logger";
import initialize from "./initialize";
import { cancelAll } from "./handle-query";
import { delay } from "awaiting";

import { connectToLockedSocket } from "@cocalc/backend/tcp/locked-socket";

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
  // We retry a few times, in case project isn't running yet.
  dbg("getting address of ", project_id);
  let socket;
  let i = 0;
  while (true) {
    try {
      const { host, port, secret_token: token } = await project.address();
      dbg("got ", host, port);
      socket = await connectToLockedSocket({ host, port, token });
      break;
    } catch (err) {
      dbg(err);
      if (i >= 10) {
        // give up!
        throw err;
      }
      await project.start();
      await delay(1000 * i);
      i += 1;
    }
  }
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
