/*
Connect from this nodejs process to a remote cocalc project over a websocket and
provide a remote terminal session.
*/

import { getRemotePtyChannelName, RemoteTerminal } from "@cocalc/terminal";

// path is something like "foo/.bar.term"
export function terminal({ websocket, path, cwd, env }) {
  const name = getRemotePtyChannelName(path);
  const channel = websocket.channel(name);
  return new RemoteTerminal(channel, {
    cwd,
    env: { TERM: "screen", ...env },
  });
}
