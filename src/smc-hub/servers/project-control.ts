import { database } from "./database";
import { getLogger } from "../logger";
import { callback2 } from "smc-util/async-utils";
const { connect_to_project } = require("../local_hub_connection");

export default async function init(program) {
  const winston = getLogger("project-control");
  winston.info("creating project control client");

  const projectControl = program.kucalc
    ? require("../kucalc/compute-client").compute_client(database, winston)
    : await callback2(require("../compute-client").compute_server, {
        database,
        dev: program.dev,
        single: program.single,
        kubernetes: program.kubernetes,
      });
  winston.info("project controller created");
  database.compute_server = projectControl;

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
    connect_to_project(project_id, database, projectControl, cb);
  };

  return projectControl;
}
