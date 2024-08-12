import { createConnection } from "net";
import type { Socket } from "net";
import { callback } from "awaiting";
import getLogger from "@cocalc/backend/logger";
import { CoCalcSocket } from "./enable-messaging-protocol";

const log = getLogger("locked-socket");

/*
unlockSocket - Wait to receive token over the socket; when it is received, call
cb(false), then send back "y". If any mistake is made (or the socket times out
after 10 seconds), send back "n" and close the connection.
*/

export async function unlockSocket(
  socket: Socket,
  token: string
): Promise<void> {
  log.debug("unlockSocket: waiting for secret token...");
  try {
    await callback(unlock, socket, token);
    log.debug("unlockSocket: SUCCESS");
  } catch (err) {
    log.debug("unlockSocket: FAILED");
    throw err;
  }
}

function unlock(socket, token, cb: (err?) => void) {
  const timeout = setTimeout(() => {
    socket.destroy();
    cb("Unlock socket -- timed out waiting for secret token");
  }, 10000);

  let userToken = "";
  function listener(data: Buffer) {
    userToken += data.toString();
    if (userToken.slice(0, token.length) === token) {
      socket.removeListener("data", listener);
      // got it!
      socket.write("y");
      clearTimeout(timeout);
      cb();
    } else if (
      userToken.length > token.length ||
      token.slice(0, userToken.length) !== userToken
    ) {
      socket.removeListener("data", listener);
      socket.write("n");
      socket.write("Invalid secret token.");
      socket.destroy();
      clearTimeout(timeout);
      cb("Invalid secret token.");
    }
  }
  socket.on("data", listener);
}

/*
Connect to a locked socket on remove server.
WARNING: Use only on a network where you do not have to worry about
an attacker listening to all traffic, since this is not an *encryption*
protocol, and it's just a symmetric key.

In CoCalc this is used to allow a hub to connect to a project.
It is not used in any other way.
*/
export async function connectToLockedSocket({
  port,
  host = "127.0.0.1",
  token,
  timeout = 5, // in seconds (not milliseconds)
}: {
  port: number;
  host?: string;
  token: string;
  timeout?: number;
}): Promise<CoCalcSocket> {
  if (port <= 0 || port >= 65536) {
    // little consistency check
    throw Error(`RangeError: port should be > 0 and < 65536: ${port}`);
  }
  log.debug("connectToLockedSocket:", `${host}:${port}`);
  return await callback(connect, port, host, token, timeout);
}

function connect(port, host, token, timeout, cb) {
  let timer: any = null;
  function finish(err?) {
    // NOTE: we set cb to undefined after calling it, and only
    // call it if defined, since the event and timer callback stuff is
    // very hard to do right without calling cb more than once
    // (which is VERY bad to do).
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    if (cb == null) return;
    if (err) {
      log.debug(`connectToLockedSocket: ERROR - ${err}`);
      cb(err);
    } else {
      log.debug("connectToLockedSocket: SUCCESS");
      cb(undefined, socket);
    }
    cb = null;
  }

  const socket = createConnection({ host, port }, function onceConnected() {
    socket.once("data", (data: Buffer) => {
      log.debug("connectToLockedSocket: got back response");
      if (data.toString() === "y") {
        finish();
      } else {
        socket.destroy();
        finish(
          "Permission denied (invalid secret token) when connecting to the local hub."
        );
      }
    });
    log.debug("connectToLockedSocket: connected, now sending secret token");
    socket.write(token);
  });

  // This is called in case there is an error trying to make the connection, e.g., "connection refused".
  socket.on("error", (err) => {
    finish(err);
  });

  function timedOut() {
    timer = null;
    finish(
      `connectToLockedSocket: timed out trying to connect to locked socket at ${host}:${port}`
    );
    socket.end();
  }

  timer = setTimeout(timedOut, timeout * 1000);
}
