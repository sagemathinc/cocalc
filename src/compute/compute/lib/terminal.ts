/*
Connect from this nodejs process to a remote cocalc project over a websocket and
provide a remote terminal session.
*/

import { getRemotePtyChannelName, RemoteTerminal } from "@cocalc/terminal";
import { userInfo } from "os";

// path is something like "foo/.bar.term"
export function terminal({ websocket, path, cwd, home, project_id }) {
  const name = getRemotePtyChannelName(path);
  const channel = websocket.channel(name);
  return new RemoteTerminal(channel, {
    cwd,
    env: {
      COCALC_PROJECT_ID: project_id,
      COCALC_USERNAME: userInfo().username,
      HOME: home ?? "/home/user",
      TERM: "screen",
    },
  });
}
