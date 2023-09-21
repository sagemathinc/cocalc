/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "@cocalc/frontend/app-framework/Table";
import { redux } from "@cocalc/frontend/app-framework";
import { isValidUUID } from "@cocalc/util/misc";
import { computeServersEnabled } from "./index";

// Create and register compute servers table for a given project,
// which gets automatically synchronized with the database, when
// changes occur.
class ComputeServersTable extends Table {
  constructor(project_id: string) {
    if (!isValidUUID(project_id)) {
      throw Error(`project_id must be a valid uuid but is ${project_id}`);
    }
    super(project_id, redux);
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
          project_id: this.name,
          id: null,
          account_id: null,
          name: null,
          color: null,
          cost_per_hour: null,
          deleted: null,
          state_changed: null,
          error: null,
          state: null,
          idle_timeout: null,
          autorestart: null,
          cloud: null,
          configuration: null,
        },
      ],
    };
  }

  _change(table) {
    const compute_servers = table.get();
    if (!compute_servers) return;
    const actions = redux.getProjectActions(this.name);
    actions.setState({ compute_servers });
  }
}

const tables: { [project_id: string]: ComputeServersTable } = {};
export function init(project_id: string) {
  if (!computeServersEnabled()) {
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
