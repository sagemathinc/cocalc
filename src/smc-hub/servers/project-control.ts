import { database } from "./database";
import { getLogger } from "../logger";
const { connect_to_project } = require("../local_hub_connection");

import { BaseProject } from "smc-hub/project-control/base";
import singleUser from "smc-hub/project-control/single-user";
import multiUser from "smc-hub/project-control/multi-user";
import kucalc from "smc-hub/project-control/kucalc";
import kubernetes from "smc-hub/project-control/kubernetes";

export const COCALC_MODES = [
  "single-user",
  "multi-user",
  "kucalc",
  "kubernetes",
];

export type ProjectControlFunction = (
  project_id: string
) => Promise<BaseProject>;

export default function init(program): ProjectControlFunction {
  const winston = getLogger("project-control");
  winston.info("creating project control client");

  let getProject;
  switch (program.mode) {
    case "single-user":
      getProject = singleUser;
      break;
    case "multi-user":
      getProject = multiUser;
      break;
    case "kucalc":
      getProject = kucalc;
      break;
    case "kubernetes":
      getProject = kubernetes;
      break;
    default:
      throw Error(`invalid mode "${program.mode}"`);
  }
  winston.info(`project controller created with mode ${program.mode}`);
  database.compute_server = getProject;

  // This is used by the database when handling certain writes to make sure
  // that the there is a connection to the corresponding project, so that
  // the project can respond.  // TODO: obviously, this is ugly!
  database.ensure_connection_to_project = (
    project_id: string,
    cb: Function
  ): void => {
    winston.debug(
      `database.ensure_connection_to_project -- project_id=${project_id}`
    );
    connect_to_project(project_id, database, getProject, cb);
  };

  return getProject;
}
