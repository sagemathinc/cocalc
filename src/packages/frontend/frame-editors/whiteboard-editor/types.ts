/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { TypedMap } from "../../app-framework";

export type ElementType =
  | "text"
  | "note"
  | "code"
  | "icon"
  | "pen"
  | "chat"
  | "terminal"
  | "stopwatch"
  | "timer"
  | "frame"
  | "edge"
  | "selection";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Element extends Rect {
  id: string;
  type: ElementType;
  data?: any; // optional json-able object - patch/merge atomic
  str?: string; // optional str data patch/merge via diff string
  z?: number; // zIndex
  group?: string; // group id if object is part of a group
  rotate?: number; // angle in *radians*
}

export type ElementMap = TypedMap<Element>;

// Tasks is an immutable map from id to Element as a map.
export type Elements = Map<string, ElementMap>;

export type Point = { x: number; y: number };
