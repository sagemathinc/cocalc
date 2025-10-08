/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Paths to temporary files used by the project.
*/

import { join } from "path";
import { data } from "@cocalc/backend/data";
import { is_valid_uuid_string, FALLBACK_PROJECT_UUID } from "@cocalc/util/misc";
import { pidFilename } from "@cocalc/util/project-info";

export const infoJson = join(data, "info.json");
export const hubPortFile = join(data, "hub-server.port");
export const apiServerPortFile = join(data, "api-server.port");
export const browserPortFile = join(data, "browser-server.port");
export const projectPidFile = join(data, pidFilename);
export const startTimestampFile = join(data, "start-timestamp.txt");
export const sessionIDFile = join(data, "session-id.txt");
export const rootSymlink = join(data, "root");
export const SSH_LOG = join(data, "sshd.log");
export const SSH_ERR = join(data, "sshd.err");
export const compute_server_id = parseInt(process.env.COMPUTE_SERVER_ID ?? "0");

// secret token must be after compute_server_id is set, since it uses it.
export { secretToken } from "./secret-token";

// note that the "username" need not be the output of `whoami`, e.g.,
// when using a cc-in-cc dev project where users are "virtual".
function getIDs() {
  let project_id;
  if (process.env.COCALC_PROJECT_ID) {
    project_id = process.env.COCALC_PROJECT_ID;
  } else if (process.env.HOME) {
    const v = process.env.HOME.split("/");
    if (is_valid_uuid_string(v[v.length - 1])) {
      project_id = v[v.length - 1];
    }
  }
  if (!project_id) {
    // fallback generic project_id
    project_id = FALLBACK_PROJECT_UUID;
  }
  // Throw in some consistency checks:
  if (!is_valid_uuid_string(project_id)) {
    throw Error(`project_id=${project_id} is not a valid UUID`);
  }
  const username = process.env.COCALC_USERNAME ?? "user";
  return { project_id, username };
}

export const { project_id, username } = getIDs();
