import type { Socket } from "net";
import { callback } from "awaiting";

/*
unlockSocket - Wait to receive token over the socket; when it is received, call
cb(false), then send back "y". If any mistake is made (or the socket times out
after 10 seconds), send back "n" and close the connection.
*/

export async function unlockSocket(socket: Socket, token: string): Promise<void> {
  await callback(unlock, socket, token);
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

// Connect to a locked socket on host, unlock it, and do
//       cb(err, unlocked_socket).
// WARNING: Use only on an encrypted VPN, since this is not
// an *encryption* protocol.
/*
function connectToLockedSocket(opts) {
  let { port, host, token, timeout, cb } = defaults(opts, {
    host: "localhost",
    port: required,
    token: required,
    timeout: 5,
    cb: required,
  });

  if (!(port > 0 && port < 65536)) {
    cb(
      `connect_to_locked_socket -- RangeError: port should be > 0 and < 65536: ${port}`
    );
    return;
  }
  const winston = getLogger("misc_node.connect_to_locked_socket");

  winston.debug(`misc_node: connecting to a locked socket on port ${port}...`);
  let timer = undefined;

  const timed_out = function () {
    const m = `misc_node: timed out trying to connect to locked socket on port ${port}`;
    winston.debug(m);
    cb?.(m);
    cb = undefined; // NOTE: here and everywhere below we set cb to undefined after calling it, and only call it if defined, since the event and timer callback stuff is very hard to do right here without calling cb more than once (which is VERY bad to do).
    socket?.end();
    return (timer = undefined);
  };

  timer = setTimeout(timed_out, timeout * 1000);

  var socket = net.connect({ host, port }, () => {
    var listener = function (data) {
      winston.debug(`misc_node: got back response: ${data}`);
      socket.removeListener("data", listener);
      if (data.toString() === "y") {
        if (timer != null) {
          clearTimeout(timer);
          cb?.(undefined, socket);
          return (cb = undefined);
        }
      } else {
        socket.destroy();
        if (timer != null) {
          clearTimeout(timer);
          cb?.(
            "Permission denied (invalid secret token) when connecting to the local hub."
          );
          return (cb = undefined);
        }
      }
    };
    socket.on("data", listener);
    winston.debug("misc_node: connected, now sending secret token");
    return socket.write(token);
  });

  // This is called in case there is an error trying to make the connection, e.g., "connection refused".
  return socket.on("error", (err) => {
    if (timer != null) {
      clearTimeout(timer);
    }
    cb?.(err);
    return (cb = undefined);
  });
}
*/
