/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties } from "react";
import { Map } from "immutable";
import { TypedMap } from "../../app-framework";

export type ObjectType = "point" | "markdown" | "code";

export type Point = { x: number; y: number };

export interface Object {
  id: string;
  css: CSSProperties; // determines everything about look and position.
  type: ObjectType;
  data?: object; // depends on type if set or not; patch/merge atomically
  str?: string; // depends on type if set or not; patch/merge as string
}

export type ObjectMap = TypedMap<Object>;

// Tasks is an immutable map from id to Object as a map.
export type Objects = Map<string, ObjectMap>;
