/*
Create or return the TCP connection from this server to a given project.

The connection is cached and calling this is async debounced, so call it
all you want.

This will also try to start the project up to about a minute.
*/

import getLogger from "@cocalc/backend/logger";
import { getProject } from "@cocalc/server/projects/control";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { delay } from "awaiting";
import { cancelAll } from "./handle-query";
import initialize from "./initialize";
import { callProjectMessage } from "./handle-message";
import { CoCalcSocket } from "@cocalc/backend/tcp/enable-messaging-protocol";
import { connectToLockedSocket } from "@cocalc/backend/tcp/locked-socket";

const logger = getLogger("project-connection:connect");
type Connection = any;

const CACHE: { [project_id: string]: Connection } = {};

// Whenever grabbing a socket, if we haven't tested that it is working for this long,
// we'll test it and remove it from the cache if it doesn't work.
const TEST_INTERVAL_MS = 30000;
const TEST: { [project_id: string]: number } = {};

async function testConnection(project_id: string) {
  const socket = CACHE[project_id];
  if (socket == null) {
    return;
  }
  const lastTest = TEST[project_id] ?? 0;
  const now = Date.now();
  if (now - lastTest <= TEST_INTERVAL_MS) {
    return;
  }
  logger.debug("testing connecting to ", project_id);
  try {
    const resp = await callProjectMessage({
      socket,
      mesg: { event: "ping" },
      timeoutSeconds: 15,
    });
    if (resp?.event != "pong") {
      throw Error("sent ping but got back", resp);
    }
    logger.debug(
      "testing connection to ",
      project_id,
      "working -- ping time ",
      Date.now() - now,
      " ms",
    );
  } catch (err) {
    logger.debug("testing connection to ", project_id, "failed -- ", err);
    delete CACHE[project_id];
  }
}

const END_EVENTS = ["end", "close", "error"];

async function connect(project_id: string): Promise<Connection> {
  logger.info("connect to ", project_id);
  const dbg = (...args) => logger.debug(project_id, ...args);
  if (CACHE[project_id]) {
    const socket = CACHE[project_id];
    // This is not 100% reliable, so we also periodically ping
    // project and remove socket from cache if it fails to pong back.
    // This DOES happen sometime, e.g., when frequently restarting a project.
    if (socket.destroyed || socket.readyState != "open") {
      delete CACHE[project_id];
      socket.unref();
    } else {
      dbg("got connection to ", project_id, " from cache");
      testConnection(project_id);
      return CACHE[project_id];
    }
  }

  const project = getProject(project_id);

  // Calling address starts the project running, then returns
  // information about where it is running and how to connect.
  // We retry a few times, in case project isn't running yet.
  dbg("getting address of ", project_id);
  let socket: CoCalcSocket;
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

  const free = () => {
    delete CACHE[project_id];
    logger.info("disconnect from ", project_id);
    // don't want free to be triggered more than once.
    for (const evt of END_EVENTS) {
      socket.removeListener(evt, free);
    }
    try {
      socket.end();
    } catch (_) {}
    cancelAll(project_id);
  };
  for (const evt of END_EVENTS) {
    socket.on(evt, free);
  }

  CACHE[project_id] = socket;
  return socket;
}

const getConnection: (project_id: string) => Promise<Connection> =
  reuseInFlight(connect);
export default getConnection;
