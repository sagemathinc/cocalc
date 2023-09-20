import * as message from "@cocalc/util/message";
import { readFile } from "fs/promises";

export default async function readTextFileFromProject(
  socket,
  mesg
): Promise<void> {
  const { path } = mesg;
  try {
    const content = (await readFile(path)).toString();
    socket.write_mesg(
      "json",
      message.text_file_read_from_project({ id: mesg.id, content })
    );
  } catch (err) {
    socket.write_mesg(
      "json",
      message.error({ id: mesg.id, error: err.message })
    );
  }
}
