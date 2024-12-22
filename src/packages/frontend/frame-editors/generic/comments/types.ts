import type { Position } from "codemirror";

// range of text in a codemirror editor
export interface Range {
  from: Position;
  to: Position;
}

export interface Location extends Range {
  // id within the document, e.g., cell id in a notebook
  id?: string | number;
  // field in item in document with given id.
  field?: string;
}

// range endpoints, e.g., [line0,ch0, line1,ch1, id, field] <--> {range:{from:{line:line0,ch:ch0},to:{line:line1,ch:ch1}}, id, field}

export type CompactLocation = [
  number,
  number,
  number,
  number,
  (string | number)?,
  string?,
];

// These are what is sync'd around:
export interface Comment {
  // globally unique id of the mark
  id: string;
  // location of the mark
  loc: Location;
  time?: number;
  hash?: number;
  created?: number;
  done?: boolean;
}

export interface CompactComment {
  i: string;
  l: CompactLocation;
  t?: number;
  h?: number;
  c?: number;
  d?: boolean;
}
