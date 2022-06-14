import { writeFile } from "fs";
import { promisify } from "util";
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import * as message from "@cocalc/util/message";

export default async function writeTextFileToProject(
  socket,
  mesg
): Promise<void> {
  const { content, path } = mesg;
  try {
    await ensureContainingDirectoryExists(path);
    await promisify(writeFile)(path, content);
    socket.write_mesg("json", message.file_written_to_project({ id: mesg.id }));
  } catch (err) {
    socket.write_mesg(
      "json",
      message.error({ id: mesg.id, error: err.message })
    );
  }
}
