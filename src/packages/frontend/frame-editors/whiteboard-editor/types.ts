/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { IconName } from "@cocalc/frontend/components/icon";

import { List as iList, Map as iMap } from "immutable";

import { TypedMap } from "@cocalc/frontend/app-framework";
import { TimerState } from "@cocalc/frontend/editors/stopwatch/actions";
import { AspectRatio } from "./tools/frame";

export type MainFrameType = "whiteboard" | "slides";

export type ElementType =
  | "chat"
  | "code"
  | "edge"
  | "frame"
  | "icon"
  | "note"
  | "page"
  | "pen"
  | "selection"
  | "slide"
  | "stopwatch"
  | "terminal"
  | "text"
  | "timer"
  | "speaker_notes"; // speaker_notes is used for slides

export type Point = { x: number; y: number };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Data {
  color?: string;
  countdown?: number; // used for countdown timer.
  dir?: number[]; // dir path part of edge
  fontFamily?: string;
  fontSize?: number;
  from?: string; // id of from node
  icon?: IconName; // icon
  opacity?: number;
  path?: number[]; // right now is encoded as [x,y,x2,y2,x3,y3] to be simpler to JSON.
  previewTo?: Point; // edge: instead of node, position of mouse -- used for preview edge.
  radius?: number;
  state?: TimerState; // for timer
  time?: number; // used by timer
  to?: string; // id of to node
  total?: number; // used by timer
  aspectRatio?: AspectRatio;
  base?: boolean; // if true, then item part of the "base layer" -- can't be selected; z-index is considered -oo
  end?: number;
  execCount?: number;
  hideInput?: boolean; // used for code cells
  hideOutput?: boolean; // used for code cells
  kernel?: string;
  output?: { [index: number]: object }; // code
  pos?: number; // used for sorting similar objects, e.g., pages
  runState?: string;
  start?: number;
  placeholder?: string; // use as placeholder text whenever this element is empty
  initStr?: string; // initial string when focused to edit and nothing set.
}

/*
It will be better but more work to make all the following
instead of the big union above.

interface TextData {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
}

interface NoteData {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
}

interface PathData {
  radius?: number;
  color?: string;
  path?: number[]; // right now is encoded as [x,y,x2,y2,x3,y3] to be simpler to JSON.
}

interface IconData {
  color?: string;
  fontSize?: number;
  name?: string;
}

interface EdgeData extends PathData {
  from?: string; // id of from node
  to?: string; // id of to node
  dir?: number[]; // dir path part of edge
}
*/

export interface Element extends Rect {
  id: string;
  type: ElementType;
  z: number; // zIndex
  page?: string; // the id of the page that this element is on (this used to be a page number)
  data?: Data; // optional json-able object - patch/merge atomic
  str?: string; // optional str data patch/merge via diff string
  group?: string; // group id if object is part of a group
  rotate?: number; // angle in *radians*
  locked?: boolean;
  invisible?: boolean; // not even included in the whiteboard (e.g., used to store speaker_notes)
  hide?: {
    w?: number; // width before hide
    h?: number; // height before hide
    frame?: string; // if hidden as part of a frame, this is the id of that frame
  }; // if set, hidden but had given width and height before hiding.
}

export type ElementMap = TypedMap<Element>;

// An immutable map from id to Element as a map.
export type ElementsMap = iMap<string, ElementMap>;

// Immutable map from page id to the ElementsMap consisting of all the elements on a given page.
export type PagesMap = iMap<string, ElementsMap>;

export type SortedPageList = iList<string>;

// Copied from what Antd does for tooltips: https://ant.design/components/tooltip/
export type Placement =
  | "top"
  | "left"
  | "right"
  | "bottom"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | "leftTop"
  | "leftBottom"
  | "rightTop"
  | "rightBottom";
