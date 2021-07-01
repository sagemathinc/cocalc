/*
Paths to temporary files used by the project.
*/

import { join } from "path";
import { data } from "smc-util-node/data";
import { is_valid_uuid_string } from "smc-util/misc";

export const infoJson = join(data, "info.json");

export const hubPortFile = join(data, "hub-server.port");
export const apiServerPortFile = join(data, "api-server.port");
export const browserPortFile = join(data, "browser-server.port");
export const projectPidFile = join(data, "project.pid");
export const rootSymlink = join(data, "root");
export const secretToken =
  process.env.COCALC_SECRET_TOKEN ?? join(data, "secret_token");

// note that the "username" need not be the output of `whoami`, e.g.,
// when using a cc-in-cc dev project where users are "virtual".
function getIDs() {
  let project_id, username;
  if (process.env.COCALC_PROJECT_ID && process.env.COCALC_USERNAME) {
    project_id = process.env.COCALC_PROJECT_ID;
    username = process.env.COCALC_USERNAME;
  } else {
    if (!process.env.HOME) {
      throw Error("HOME not defined, so no way to determine project_id");
    }
    const v = process.env.HOME.split("/");
    project_id = v[v.length - 1];
    if (!is_valid_uuid_string(project_id)) {
      throw Error("unable to determine project_id from HOME directory path");
    }
    username = project_id.replace(/-/g, "");
  }
  // Throw in some consistency checks:
  if (!is_valid_uuid_string(project_id)) {
    throw Error(`project_id=${project_id} is not a valid UUID`);
  }
  if (!username) {
    throw Error("unable to determine username");
  }
  return { project_id, username };
}

export const { project_id, username } = getIDs();
