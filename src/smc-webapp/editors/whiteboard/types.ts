/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List, Map, Set } from "immutable";
import { TypedMap } from "../../app-framework";

export type ObjectType = "point";

export type Point = { x: number; y: number };

export interface Object {
  id: string;
  type: ObjectType;
  pos: Point;
}

export type ObjectMap = TypedMap<Object>;

export interface LocalViewState {
  upper_left: Point;
  lower_right: Point;
}

export type LocalViewStateMap = TypedMap<LocalViewState>;

// Tasks is an immutable map from task_id (uuidv4) to Object as a map.
export type Objects = Map<string, ObjectMap>;

// State of the Store
export interface WhiteboardState {
  read_only: boolean;
  objects?: Objects;
  local_view_state: LocalViewStateMap;
  has_unsaved_changes?: boolean;
  has_uncommitted_changes?: boolean;
}
