/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties } from "react";
import { Map } from "immutable";
import { TypedMap } from "../../app-framework";

export type ElementType =
  | "text"
  | "note"
  | "code"
  | "shape"
  | "pen"
  | "chat"
  | "code"
  | "terminal"
  | "stopwatch";

export type Point = { x: number; y: number };

export interface Element {
  id: string;
  style: CSSProperties; // determines style of the object
  type: ElementType;
  x: number;
  y: number;
  z?: number; // zIndex
  w?: number; // width
  h?: number; // height
  rotate?: number; // angle in *radians*
  data?: object; // optional json-able object - patch/merge atomic
  str?: string; // optional str data patch/merge via diff string
}

export type ElementMap = TypedMap<Element>;

// Tasks is an immutable map from id to Element as a map.
export type Elements = Map<string, ElementMap>;
