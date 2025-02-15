/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { getLogger } from "@cocalc/backend/logger";
import { enable_mesg } from "@cocalc/backend/misc_node";
import { CoCalcSocket } from "@cocalc/backend/tcp/enable-messaging-protocol";
import { connectToLockedSocket } from "@cocalc/backend/tcp/locked-socket";
import * as message from "@cocalc/util/message";
import { retry_until_success } from "@cocalc/util/misc";
import * as common from "./common";
import { forget_port, get_port } from "./port_manager";
import {
  SAGE_SERVER_MAX_STARTUP_TIME_S,
  restart_sage_server,
} from "./sage_restart";
import { getSecretToken } from "./servers/secret-token";
import { CB } from "@cocalc/util/types/callback";

const winston = getLogger("sage-socket");

// Get a new connection to the Sage server.  If the server
// isn't running, e.g., it was killed due to running out of memory,
// attempt to restart it and try to connect.
export async function get_sage_socket(): Promise<CoCalcSocket> {
  let socket: CoCalcSocket | undefined;
  const try_to_connect = async (cb: CB) => {
    try {
      socket = await _get_sage_socket();
      cb();
    } catch (err) {
      // Failed for some reason: try to restart one time, then try again.
      // We do this because the Sage server can easily get killed due to out of memory conditions.
      // But we don't constantly try to restart the server, since it can easily fail to start if
      // there is something wrong with a local Sage install.
      // Note that restarting the sage server doesn't impact currently running worksheets (they
      // have their own process that isn't killed).
      try {
        await restart_sage_server();
        // success at restarting sage server: *IMMEDIATELY* try to connect
        socket = await _get_sage_socket();
        cb();
      } catch (err) {
        // won't actually try to restart if called recently.
        cb(err);
      }
    }
  };

  return new Promise((resolve, reject) => {
    retry_until_success({
      f: try_to_connect,
      start_delay: 50,
      max_delay: 5000,
      factor: 1.5,
      max_time: SAGE_SERVER_MAX_STARTUP_TIME_S * 1000,
      log(m) {
        winston.debug(`get_sage_socket: ${m}`);
      },
      cb(err) {
        if (socket == null) {
          reject("failed to get sage socket");
        } else if (err) {
          reject(err);
        } else {
          resolve(socket);
        }
      },
    });
  });
}

async function _get_sage_socket(): Promise<CoCalcSocket> {
  winston.debug("get sage server port");
  const port = await get_port("sage");
  winston.debug("get and unlock socket");
  if (port == null) throw new Error("port is null");
  try {
    const sage_socket: CoCalcSocket | undefined = await connectToLockedSocket({
      port,
      token: getSecretToken(),
    });
    winston.debug("Successfully unlocked a sage session connection.");

    winston.debug("request sage session from server.");
    enable_mesg(sage_socket);
    sage_socket.write_mesg("json", message.start_session({ type: "sage" }));
    winston.debug(
      "Waiting to read one JSON message back, which will describe the session....",
    );
    // TODO: couldn't this just hang forever :-(
    return new Promise<CoCalcSocket>((resolve) => {
      sage_socket.once("mesg", (_type, desc) => {
        winston.debug(
          `Got message back from Sage server: ${common.json(desc)}`,
        );
        sage_socket.pid = desc.pid;
        resolve(sage_socket);
      });
    });
  } catch (err2) {
    forget_port("sage");
    const msg = `_new_session: sage session denied connection: ${err2}`;
    throw new Error(msg);
  }
}
