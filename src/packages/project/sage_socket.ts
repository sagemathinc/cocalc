/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { getLogger } from "@cocalc/backend/logger";
import { secretToken } from "@cocalc/project/data";
import { enable_mesg } from "@cocalc/backend/misc_node";
import { CoCalcSocket } from "@cocalc/backend/tcp/enable-messaging-protocol";
import { connectToLockedSocket } from "@cocalc/backend/tcp/locked-socket";
import * as message from "@cocalc/util/message";
import * as common from "./common";
import { forget_port, get_port } from "./port_manager";
import {
  SAGE_SERVER_MAX_STARTUP_TIME_S,
  restartSageServer,
} from "./sage_restart";
import { until, once } from "@cocalc/util/async-utils";

const logger = getLogger("get-sage-socket");

// Get a new connection to the Sage server.  If the server
// isn't running, e.g., it was killed due to running out of memory,
// attempt to restart it and try to connect.
export async function getSageSocket(): Promise<CoCalcSocket> {
  let socket: CoCalcSocket | undefined = undefined;
  await until(
    async () => {
      try {
        socket = await _getSageSocket();
        return true;
      } catch (err) {
        logger.debug(
          `error getting sage socket so restarting sage server -- ${err}`,
        );
        // Failed for some reason: try to restart one time, then try again.
        // We do this because the Sage server can easily get killed due to out of memory conditions.
        // But we don't constantly try to restart the server, since it can easily fail to start if
        // there is something wrong with a local Sage install.
        // Note that restarting the sage server doesn't impact currently running worksheets (they
        // have their own process that isn't killed).
        await restartSageServer();
        try {
          socket = await _getSageSocket();
          return true;
        } catch (err) {
          logger.debug(err);
        }
        return false;
      }
    },
    {
      start: 250,
      max: 5000,
      decay: 1.5,
      timeout: SAGE_SERVER_MAX_STARTUP_TIME_S * 1000,
    },
  );
  if (socket === undefined) {
    throw Error("bug");
  }
  return socket;
}

async function _getSageSocket(): Promise<CoCalcSocket> {
  logger.debug("get sage server port");
  const port = await get_port("sage");
  logger.debug(`get and unlock socket on port ${port}`);
  if (!port) {
    throw new Error("port is not set");
  }
  try {
    const sage_socket: CoCalcSocket = await connectToLockedSocket({
      port,
      token: secretToken,
    });
    logger.debug("Successfully unlocked a sage session connection.");

    logger.debug("request sage session from server.");
    enable_mesg(sage_socket);
    sage_socket.write_mesg("json", message.start_session({ type: "sage" }));
    logger.debug(
      "Waiting to read one JSON message back, which will describe the session....",
    );
    const [_type, desc] = await once(sage_socket, "mesg", 30000);
    logger.debug(`Got message back from Sage server: ${common.json(desc)}`);
    sage_socket.pid = desc.pid;
    return sage_socket;
  } catch (err) {
    forget_port("sage");
    const msg = `_new_session: sage session denied connection: ${err}`;
    logger.debug(`Failed to connect -- ${msg}`);
    throw Error(msg);
  }
}
