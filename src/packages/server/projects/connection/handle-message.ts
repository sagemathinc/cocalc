/*
Handle incoming JSON messages from a project.
*/

import { promisify } from "node:util";
import { v4 } from "uuid";

import getLogger from "@cocalc/backend/logger";
import { TIMEOUT_CALLING_PROJECT } from "@cocalc/util/consts/project";
import { error, pong } from "@cocalc/util/message";
import handleQuery from "./handle-query";
import handleVersion from "./handle-version";

const logger = getLogger("project-connection:handle-message");

interface Options {
  socket;
  project_id: string;
  mesg;
}

const callCallbacks: { [id: string]: Function } = {};

export default async function handleMessage({
  socket,
  project_id,
  mesg,
}: Options): Promise<void> {
  logger.debug("received message ", project_id);

  if (mesg.event == "version") {
    handleVersion(project_id, mesg.version);
    return;
  }
  // globally unique random uuid
  const { id } = mesg;
  if (id == null) {
    // all messages except "version" must have an id
    logger.warn("WARNING: all messages except 'version' must have an id", mesg);
    return;
  }

  const f = callCallbacks[id];
  if (f != null) {
    f(mesg);
    return;
  }

  logger.debug("handling call from project");
  function sendResponse(resp) {
    resp.id = id;
    socket.write_mesg("json", resp);
  }

  try {
    switch (mesg.event) {
      case "ping":
        sendResponse(pong());
        return;
      case "query":
      case "query_cancel":
        await handleQuery({ project_id, mesg, sendResponse });
        return;
      case "file_written_to_project":
      case "file_read_from_project":
      case "error":
        // ignore/deprecated/don't care...?
        return;
      default:
        throw Error(`unknown event '${mesg.event}'`);
    }
  } catch (err) {
    sendResponse(error({ error: `${err}` }));
  }
}

export async function callProjectMessage({
  socket,
  mesg,
  timeoutSeconds = 60, // DEV: change this to 3 to simulate quick timeouts
}): Promise<any> {
  logger.debug("callProjectMessage", mesg.event, mesg.id);
  while (mesg.id == null || callCallbacks[mesg.id] != null) {
    mesg.id = v4();
  }

  const getResponse = promisify((cb: (err: any, resp?: any) => void) => {
    callCallbacks[mesg.id] = (resp) => {
      logger.debug("callProjectMessage -- got response", resp.id);
      cb(undefined, resp);
    };
    setTimeout(() => {
      cb(TIMEOUT_CALLING_PROJECT);
      callCallbacks[mesg.id] = () => {
        logger.debug(
          mesg.id,
          `callProjectMessage -- ignoring response due to timeout ${timeoutSeconds}s`,
        );
      };
    }, timeoutSeconds * 1000);
  });

  socket.write_mesg("json", mesg);
  return await getResponse();
}
