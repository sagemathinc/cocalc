/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Handle a general message from the hub.  These are the generic message,
as opposed to the messages specific to "client" functionality such as
database queries.
*/

import processKill from "@cocalc/backend/misc/process-kill";
import { CoCalcSocket } from "@cocalc/backend/tcp/enable-messaging-protocol";
import { handle_save_blob_message } from "@cocalc/project/blobs";
import { getClient } from "@cocalc/project/client";
import { project_id } from "@cocalc/project/data";
import { exec_shell_code } from "@cocalc/project/exec_shell_code";
import { get_kernel_data } from "@cocalc/jupyter/kernel/kernel-data";
import jupyterExecute from "@cocalc/jupyter/stateless-api/execute";
import { getLogger } from "@cocalc/project/logger";
import handleNamedServer from "@cocalc/project/named-servers";
import { print_to_pdf } from "@cocalc/project/print_to_pdf";
import {
  read_file_from_project,
  write_file_to_project,
} from "@cocalc/project/read_write_files";
import * as message from "@cocalc/util/message";
import { version } from "@cocalc/util/smc-version";
import { Message } from "./types";
import writeTextFileToProject from "./write-text-file-to-project";
import readTextFileFromProject from "./read-text-file-from-project";
import { jupyter_execute_response } from "@cocalc/util/message";

const logger = getLogger("handle-message-from-hub");

export default async function handleMessage(
  socket: CoCalcSocket,
  mesg: Message,
) {
  logger.debug("received a message", {
    event: mesg.event,
    id: mesg.id,
    "...": "...",
  });

  // We can't just log this in general, since it can be big.
  // So only uncomment this for low level debugging, unfortunately.
  // logger.debug("received ", mesg);

  if (getClient().handle_mesg(mesg, socket)) {
    return;
  }

  switch (mesg.event) {
    case "heartbeat":
      logger.debug(`received heartbeat on socket '${socket.id}'`);
      // Update the last hearbeat timestamp, so we know socket is working.
      socket.heartbeat = new Date();
      return;

    case "ping":
      // ping message is used only for debugging purposes.
      socket.write_mesg("json", message.pong({ id: mesg.id }));
      return;

    case "named_server_port":
      handleNamedServer(socket, mesg);
      return;

    case "project_exec":
      // this is no longer used by web browser clients; however it *is* used by the HTTP api served
      // by the hub to api key users, so do NOT remove it!  E.g., the latex endpoint, the compute
      // server, etc., use it.   The web browser clients use the websocket api.
      exec_shell_code(socket, mesg);
      return;

    case "jupyter_execute":
      try {
        const outputs = await jupyterExecute(mesg as any);
        socket.write_mesg(
          "json",
          jupyter_execute_response({ id: mesg.id, output: outputs }),
        );
      } catch (err) {
        socket.write_mesg(
          "json",
          message.error({
            id: mesg.id,
            error: `${err}`,
          }),
        );
      }
      return;

    case "jupyter_kernels":
      try {
        socket.write_mesg(
          "json",
          message.jupyter_kernels({
            kernels: await get_kernel_data(),
            id: mesg.id,
          }),
        );
      } catch (err) {
        socket.write_mesg(
          "json",
          message.error({
            id: mesg.id,
            error: `${err}`,
          }),
        );
      }
      return;

    // Reading and writing files to/from project and sending over socket
    case "read_file_from_project":
      read_file_from_project(socket, mesg);
      return;

    case "write_file_to_project":
      write_file_to_project(socket, mesg);
      return;

    case "write_text_file_to_project":
      writeTextFileToProject(socket, mesg);
      return;

    case "read_text_file_from_project":
      readTextFileFromProject(socket, mesg);
      return;

    case "print_to_pdf":
      print_to_pdf(socket, mesg);
      return;

    case "send_signal":
      if (
        mesg.pid &&
        (mesg.signal == 2 || mesg.signal == 3 || mesg.signal == 9)
      ) {
        processKill(mesg.pid, mesg.signal);
      } else {
        if (mesg.id) {
          socket.write_mesg(
            "json",
            message.error({
              id: mesg.id,
              error: "invalid pid or signal (must be 2,3,9)",
            }),
          );
        }
        return;
      }
      if (mesg.id != null) {
        // send back confirmation that a signal was sent
        socket.write_mesg("json", message.signal_sent({ id: mesg.id }));
      }
      return;

    case "save_blob":
      handle_save_blob_message(mesg);
      return;

    case "error":
      logger.error(`ERROR from hub: ${mesg.error}`);
      return;

    case "hello":
      // No action -- this is used by the hub to send an initial control message that has no effect, so that
      // we know this socket will be used for control messages.
      logger.info(`hello from hub -- sending back our version = ${version}`);
      socket.write_mesg("json", message.version({ version }));
      return;

    default:
      if (mesg.id != null) {
        // only respond with error if there is an id -- otherwise response has no meaning to hub.
        const err = message.error({
          id: mesg.id,
          error: `Project ${project_id} does not implement handling mesg with event='${mesg.event}'`,
        });
        socket.write_mesg("json", err);
      } else {
        logger.debug(`Dropping unknown message with event='${mesg.event}'`);
      }
  }
}
