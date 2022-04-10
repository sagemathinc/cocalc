/*
Use the project hub socket API to communicate with the project.

The supported messages are implemented here in the project:

   cocalc/src/packages/project/servers/hub/handle-message.ts

and messages must be defined as in

   cocalc/src/packages/util/message.js

and they include:

- ping: for testing; returns a pong
- heartbeat: used for maintaining the connection
- named_server_port: finding out the port used by jupyter, jupyterlab, etc.
- project_exec: run shell command
- read_file_from_project: reads file and stores it as a blob in the database. blob expires in 24 hours.
- write_file_to_project: write abitrary file to disk in project (goes via a blob)
- write_text_file_to_project: write a text file, whose contents is in the message, to the project.
- print_to_pdf: tells sage worksheet to print
- send_signal: send a signal to a process
*/


import { callProjectMessage } from "./handle-message";
import getConnection from "./connect";
//import getLogger from "@cocalc/backend/logger";
//const logger = getLogger("project-connection:call");

export default async function call({
  project_id,
  mesg,
}: {
  project_id: string;
  mesg;
}): Promise<any> {
  const socket = await getConnection(project_id);
  return await callProjectMessage({ mesg, socket });
}
