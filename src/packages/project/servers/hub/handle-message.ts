/*
Handle a general message from the hub.  These are the generic message,
as opposed to the messages specific to "client" functionality such as
database queries.
*/

import { getLogger } from "@cocalc/project/logger";
import { Message } from "./types";
import * as message from "@cocalc/util/message";
import handleNamedServer from "@cocalc/project/named-servers";
const { exec_shell_code } = require("@cocalc/project/exec_shell_code");
// Reading and writing files to/from project and sending over socket
const {
  read_file_from_project,
  write_file_to_project,
} = require("@cocalc/project/read_write_files");
const { print_to_pdf } = require("@cocalc/project/print_to_pdf");
const { process_kill } = require("@cocalc/backend/misc_node");
const { handle_save_blob_message } = require("@cocalc/project/blobs");
const client = require("@cocalc/project/client");
import { version } from "@cocalc/util/smc-version";
import writeTextFileToProject from "./write-text-file-to-project";

const winston = getLogger("handle-message-from-hub");

export default function handleMessage(socket, mesg: Message) {
  winston.debug("received ", mesg);

  if (client.client?.handle_mesg(mesg, socket)) {
    return;
  }

  switch (mesg.event) {
    case "heartbeat":
      winston.debug(`received heartbeat on socket '${socket.id}'`);
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
      // by the hub to api key users, so do NOT remove it!
      // The web browser clients use the websocket api,
      exec_shell_code(socket, mesg);
      return;

    case "read_file_from_project":
      read_file_from_project(socket, mesg);
      return;

    case "write_file_to_project":
      write_file_to_project(socket, mesg);
      return;

    case "write_text_file_to_project":
      writeTextFileToProject(socket, mesg);
      return;

    case "print_to_pdf":
      print_to_pdf(socket, mesg);
      return;

    case "send_signal":
      process_kill(mesg.pid, mesg.signal);
      if (mesg.id != null) {
        // send back confirmation that a signal was sent
        socket.write_mesg("json", message.signal_sent({ id: mesg.id }));
      }
      return;

    case "save_blob":
      handle_save_blob_message(mesg);
      return;

    case "error":
      winston.error(`ERROR from hub: ${mesg.error}`);
      return;

    case "hello":
      // No action -- this is used by the hub to send an initial control message that has no effect, so that
      // we know this socket will be used for control messages.
      winston.info(`hello from hub -- sending back our version = ${version}`);
      socket.write_mesg("json", message.version({ version }));
      return;
    default:
      if (mesg.id != null) {
        // only respond with error if there is an id -- otherwise response has no meaning to hub.
        const err = message.error({
          id: mesg.id,
          error: `Project does not implement handling mesg with event='${mesg.event}'`,
        });
        socket.write_mesg("json", err);
      } else {
        winston.debug(`Dropping unknown message with event='${mesg.event}'`);
      }
  }
}
