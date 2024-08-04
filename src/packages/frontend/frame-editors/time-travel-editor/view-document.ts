import { fromJS } from "immutable";
import type { Document } from "@cocalc/sync/editor/generic/types";

export class ViewDocument implements Document {
  private v: any[] = [];
  private str: string;

  constructor(str: string) {
    this.str = str;
    const v: any[] = [];
    for (const x of str.split("\n")) {
      v.push(JSON.parse(x));
    }
    this.v = v;
  }

  // @ts-ignore
  apply_patch(_patch) {
    throw Error("not implemented");
  }

  // @ts-ignore
  make_patch(_doc) {
    throw Error("not implemented");
  }

  // @ts-ignore
  is_equal(_doc) {
    throw Error("not implemented");
  }

  to_str() {
    return this.str;
  }

  // @ts-ignore
  set(_x) {
    throw Error("not implemented");
  }

  get(query) {
    const matches: any[] = [];
    for (const x of this.v) {
      for (const key in query) {
        if (x[key] != query[key]) {
          continue;
        }
      }
      // match
      matches.push(x);
    }
    return fromJS(matches);
  }

  get_one(query) {
    for (const x of this.v) {
      for (const key in query) {
        if (x[key] != query[key]) {
          continue;
        }
      }
      // match
      return fromJS(x);
    }
  }

  // @ts-ignore
  delete(_query) {
    throw Error("not implemented");
  }

  // optional info about what changed going from prev to this.
  changes(_prev) {
    throw Error("not implemented");
  }
  // how many in this document (length of string number of records in db-doc, etc.)
  count() {
    return this.v.length;
  }
}
