/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Paths to temporary files used by the project.
*/

import { join } from "path";
import { data } from "@cocalc/backend/data";
import { is_valid_uuid_string } from "@cocalc/util/misc";
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
export const secretToken =
  process.env.COCALC_SECRET_TOKEN ?? join(data, "secret_token");
export const compute_server_id = parseInt(process.env.COMPUTE_SERVER_ID ?? "0");

// note that the "username" need not be the output of `whoami`, e.g.,
// when using a cc-in-cc dev project where users are "virtual".
function getIDs() {
  let project_id;
  if (process.env.COCALC_PROJECT_ID) {
    project_id = process.env.COCALC_PROJECT_ID;
  } else {
    if (!process.env.HOME) {
      throw Error("HOME not defined, so no way to determine project_id");
    }
    const v = process.env.HOME.split("/");
    project_id = v[v.length - 1];
    if (!is_valid_uuid_string(project_id)) {
      throw Error("unable to determine project_id from HOME directory path");
    }
  }
  // Throw in some consistency checks:
  if (!is_valid_uuid_string(project_id)) {
    throw Error(`project_id=${project_id} is not a valid UUID`);
  }
  const username = process.env.COCALC_USERNAME ?? project_id.replace(/-/g, "");
  return { project_id, username };
}

export const { project_id, username } = getIDs();
