import { project } from "@cocalc/api-client";
import SyncClient from "@cocalc/sync-client";
import getLogger from "@cocalc/backend/logger";
import { getRemotePtyChannelName, RemoteTerminal } from "@cocalc/terminal";
import { aux_file, path_split } from "@cocalc/util/misc";
const logger = getLogger("compute:terminal");

interface Options {
  // which project -- defaults to process.env.PROJECT_ID, which must be given if this isn't
  project_id?: string;
  // path of terminal -- NOT optional
  path: string;
  number?: number; // used for naming term
  cmd?: string; // used just for naming term
  // optional directory to change to before starting session
  cwd?: string;
}

// path should be something like "foo/.bar.term"
// This particular code for now is just about making one single frame
// use a remote terminal.  We will of course be building much more on this.
// This is basically the foundational proof of concept step.
export async function terminal({
  project_id = process.env.PROJECT_ID,
  path,
  number = 0,
  cmd = "",
  cwd,
}: Options) {
  if (!project_id) {
    throw Error("project_id or process.env.PROJECT_ID must be given");
  }
  const log = (...args) => logger.debug(path, ...args);
  if (!path_split(path).tail.startsWith(".")) {
    path = aux_file(`${path}-${number}${cmd}`, "term");
  }
  log("connect to ", path);
  await project.ping({ project_id });

  // Get a websocket connection to the project:
  const client = new SyncClient({ project_id });
  log("getting websocket connection to project", project_id);
  const websocket = await client.project_client.websocket(project_id);
  return connectToTerminal({ websocket, path, cwd });
}

export function connectToTerminal({ websocket, path, cwd }) {
  const name = getRemotePtyChannelName(path);
  const channel = websocket.channel(name);
  return new RemoteTerminal(channel, cwd);
}
