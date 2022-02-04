/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties } from "react";
import { Map } from "immutable";
import { TypedMap } from "../../app-framework";

export type NodeType =
  | "text"
  | "note"
  | "code"
  | "shape"
  | "pen"
  | "chat"
  | "terminal"
  | "stopwatch"
  | "timer"
  | "frame"
  | "selection";

export interface Base {
  id: string;
  data?: any; // optional json-able object - patch/merge atomic
  str?: string; // optional str data patch/merge via diff string
  z?: number; // zIndex
}

export interface Element extends Base {
  type: NodeType;
  x: number;
  y: number;
  w?: number; // width
  h?: number; // height
  rotate?: number; // angle in *radians*
}

export interface Edge extends Base {
  type: "edge";
  from: string; // a node id
  to: string; // a node id
}

export type ElementMap = TypedMap<Element>;

// Tasks is an immutable map from id to Element as a map.
export type Elements = Map<string, ElementMap>;
