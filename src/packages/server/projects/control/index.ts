import { db } from "@cocalc/database";
import getLogger from "@cocalc/backend/logger";
import connectToProject from "@cocalc/server/projects/connection";

import { BaseProject } from "./base";
import singleUser from "./single-user";
import multiUser from "./multi-user";
import kucalc from "./kucalc";
import kubernetes from "./kubernetes";

export const COCALC_MODES = [
  "single-user",
  "multi-user",
  "kucalc",
  "kubernetes",
];

type ValueOf<T> = T[keyof T]; // https://stackoverflow.com/questions/49285864/is-there-a-valueof-similar-to-keyof-in-typescript
export type CocalcMode = ValueOf<typeof COCALC_MODES>;

export type ProjectControlFunction = (project_id: string) => BaseProject;

let cached: ProjectControlFunction | undefined = undefined;

export default function init(mode?: CocalcMode): ProjectControlFunction {
  const winston = getLogger("project-control");
  if (cached !== undefined) {
    winston.info("using cached project control client");
    return cached;
  }
  if (mode === undefined) {
    throw Error(
      "you can only call projects/control with no mode argument AFTER it has been initialized by the hub"
    );
  }
  winston.info("creating project control client");

  let getProject;
  switch (mode) {
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
      throw Error(`invalid mode "${mode}"`);
  }
  winston.info(`project controller created with mode ${mode}`);
  const database = db();
  database.compute_server = getProject;

  // This is used by the database when handling certain writes to make sure
  // that the there is a connection to the corresponding project, so that
  // the project can respond.  // TODO: obviously, this is ugly!
  database.ensure_connection_to_project = (
    project_id: string,
    cb?: Function
  ): void => {
    winston.debug(
      `database.ensure_connection_to_project -- project_id=${project_id}`
    );
    cb?.("not implemented");
    connectToProject(project_id);
  };

  cached = getProject;
  return getProject;
}

export const getProject: ProjectControlFunction = (project_id: string) => {
  if (cached == null) {
    throw Error("must call init first");
  }
  return cached(project_id);
};
