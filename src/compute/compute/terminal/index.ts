import { project } from "@cocalc/api-client";
import getLogger from "@cocalc/backend/logger";
const logger = getLogger("compute:terminal");

// path should be something like "foo/.bar.term"
// This particular code for now is just about making one single frame
// use a remote terminal.  We will of course be building much more on this.
// This is basically the foundational proof of concept step.
export async function terminal({
  project_id,
  path,
  cwd,
}: {
  project_id: string;
  path: string;
  cwd?: string;
}) {
  const log = (...args) => logger.debug(path, ...args);
  log();
  if (cwd != null) {
    process.chdir(cwd);
  }

  await project.ping({ project_id });


}
