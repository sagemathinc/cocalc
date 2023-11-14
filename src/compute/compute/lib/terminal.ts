/*
Connect from this nodejs process to a remote cocalc project over a websocket and
provide a remote terminal session.
*/

import { RemoteTerminal } from "@cocalc/terminal";

// path is something like "foo/.bar.term"
export function terminal({ websocket, path, cwd, env, computeServerId }) {
  return new RemoteTerminal(
    websocket,
    path,
    {
      cwd,
      env: { TERM: "screen", ...env },
    },
    computeServerId,
  );
}
