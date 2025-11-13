/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Create a singleton websocket connection directly to a particular project.

This is something that is annoyingly NOT supported by Primus.
Many projects (perhaps dozens) can be open for a given client
wat once, and hence we make many Primus websocket connections
simultaneously to the same domain.  It does work, but not without an ugly hack.
*/

import { API } from "./api";
import { set_project_websocket_state } from "./websocket-state";

const connections = {};

import { EventEmitter } from "events";
class FakeConn extends EventEmitter {
  public api: API;
  constructor(project_id) {
    super();
    this.api = new API(project_id);
    set_project_websocket_state(project_id, "online");
  }
  destroy = () => {};
}

export async function connection_to_project(project_id: string): Promise<any> {
  if (project_id == null || project_id.length != 36) {
    throw Error(`project_id (="${project_id}") must be a valid uuid`);
  }
  if (connections[project_id] !== undefined) {
    return connections[project_id];
  }
  connections[project_id] = new FakeConn(project_id);
  return connections[project_id];
}

export function disconnect_from_project(project_id: string): void {
  const conn = connections[project_id];
  if (conn === undefined) {
    return;
  }
  // TODO: maybe go through and fail any outstanding api calls?
  conn.destroy();
  delete conn.api;
  delete connections[project_id];
}

export function disconnect_from_all_projects(): void {
  for (const project_id in connections) {
    disconnect_from_project(project_id);
  }
}
