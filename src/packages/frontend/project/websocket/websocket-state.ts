/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// offline -- it's not connected, but is **trying**
// online -- it's connected and working
// destroyed -- it's not connected and not trying to connect either.
import type { WebsocketState } from "@cocalc/sync/client/types";
export type { WebsocketState };

import { Map } from "immutable";

import { redux } from "../../app-framework";

function get_state(): Map<string, WebsocketState> {
  const store = redux.getStore("projects");
  if (store == null) {
    throw Error("projects store must be defined");
  }
  const s = store.get("project_websockets");
  if (s == null) {
    return Map();
  } else {
    return s;
  }
}

function set_state(project_websockets: Map<string, WebsocketState>): void {
  const actions = redux.getActions("projects");
  if (actions == null) {
    throw Error("projects actions must be defined");
  }
  actions.setState({ project_websockets });
}

export function set_project_websocket_state(
  project_id: string,
  state: WebsocketState
): void {
  set_state(get_state().set(project_id, state));
}
