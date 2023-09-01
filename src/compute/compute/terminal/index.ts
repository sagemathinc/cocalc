import { project } from "@cocalc/api-client";
import SyncClient from "@cocalc/sync-client";
import getLogger from "@cocalc/backend/logger";
import { getRemotePtyChannelName } from "@cocalc/terminal";

const logger = getLogger("compute:terminal");

interface Options {
  // which project -- defaults to process.env.PROJECT_ID, which must be given if this isn't
  project_id?: string;
  // path of terminal -- NOT optional
  path: string;
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
  cwd,
}: Options) {
  if (!project_id) {
    throw Error("project_id or process.env.PROJECT_ID must be given");
  }
  const log = (...args) => logger.debug(path, ...args);
  log();
  if (cwd != null) {
    process.chdir(cwd);
  }
  await project.ping({ project_id });

  // Get a websocket connection to the project:
  const client = new SyncClient();
  log("getting websocket connection to project", project_id);
  const ws = await client.project_client.websocket(project_id);
  const name = getRemotePtyChannelName(path);
  log("opening channel", name);
  const channel = ws.channel(name);
  channel.on("data", (data) => {
    console.log("channel got data!", { data });
  });
  return channel;
}
