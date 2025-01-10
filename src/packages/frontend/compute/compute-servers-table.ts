/*
Compute servers in a specific project.
*/

import { Table } from "@cocalc/frontend/app-framework/Table";
import { redux } from "@cocalc/frontend/app-framework";
import { isValidUUID } from "@cocalc/util/misc";
import { computeServersEnabled } from "./config";
import { delay } from "awaiting";

const PREFIX = "compute-server-";
function projectIdToName(project_id) {
  return `${PREFIX}${project_id}`;
}
function nameToProjectId(name) {
  return name.slice(PREFIX.length);
}

// Create and register compute servers table for a given project,
// which gets automatically synchronized with the database, when
// changes occur.
class ComputeServersTable extends Table {
  constructor(project_id: string) {
    if (!isValidUUID(project_id)) {
      throw Error(`project_id must be a valid uuid but is ${project_id}`);
    }
    super(projectIdToName(project_id), redux);
    this.query = this.query.bind(this);
    this._change = this._change.bind(this);
  }

  options() {
    return [];
  }

  query() {
    return {
      compute_servers: [
        {
          project_id: nameToProjectId(this.name),
          id: null,
          project_specific_id: null,
          account_id: null,
          title: null,
          color: null,
          cost_per_hour: null,
          deleted: null,
          error: null,
          state: null,
          state_changed: null,
          autorestart: null,
          cloud: null,
          configuration: null,
          provisioned_configuration: null,
          data: null,
          avatar_image_tiny: null,
          last_edited: null,
          last_edited_user: null,
          purchase_id: null,
          detailed_state: null,
          position: null,
          template: null,
          spend: null,
        },
      ],
    };
  }

  _change(table) {
    const actions = redux.getProjectActions(nameToProjectId(this.name));
    // Using {compute_servers:table.get()} does NOT work. The id keys are integers,
    // which leads to problems when converting after an update.
    actions.setState({ compute_servers: table.get()?.toJS() });
  }
}

const tables: { [project_id: string]: ComputeServersTable } = {};
export async function init(project_id: string) {
  let enabled = computeServersEnabled();
  while (enabled === null) {
    // customize hasn't been loaded yet, so we don't know.
    await delay(1000);
    enabled = computeServersEnabled();
  }

  if (!enabled) {
    // no need -- would just waste resources
    return;
  }
  if (tables[project_id] != null) {
    return;
  }
  tables[project_id] = new ComputeServersTable(project_id);
}

export function close(project_id: string) {
  if (tables[project_id] == null) {
    return;
  }
  tables[project_id].close();
  delete tables[project_id];
}
