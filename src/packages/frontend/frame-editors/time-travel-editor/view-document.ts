import { fromJS, type List } from "immutable";
import type { Document } from "@cocalc/sync/editor/generic/types";
import { filenameMode } from "@cocalc/frontend/file-associations";
import parseIpynb from "@cocalc/jupyter/ipynb/parse";

export function isObjectDoc(path) {
  /* not a great way to tell if json lines or text? */
  const obj = "__cocalc__object_doc__";
  return filenameMode(path, obj) == obj;
}

export class ViewDocument implements Document {
  private v: any[] | null;
  private str: string;

  constructor(path: string, str: string) {
    let s = str;
    let v: any[] | null = null;
    if (path.endsWith(".ipynb")) {
      // Jupyter is a bit weird -- we parse the string ipynb to our internal jsonl format,
      // then work with that exclusively, and ALSO make to_str() return that.
      if (str.trim()) {
        const { cells } = parseIpynb(str);
        v = Object.values(cells);
        s = v.map((x) => JSON.stringify(x)).join("\n");
      }
    } else if (isObjectDoc(path)) {
      v = [];
      for (const x of str.split("\n")) {
        v.push(JSON.parse(x));
      }
    }
    this.str = s;
    this.v = v;
  }

  apply_patch(_patch): any {
    throw Error("not implemented");
  }

  apply_patch_batch(_patches: any[]): any {
    throw Error("not implemented");
  }

  make_patch(_doc): any {
    throw Error("not implemented");
  }

  is_equal(_doc): boolean {
    throw Error("not implemented");
  }

  to_str(): string {
    return this.str;
  }

  set(_x: any): this {
    throw Error("not implemented");
  }

  get(query?): List<any> {
    const v = this.v;
    if (v == null) {
      return fromJS([]);
    }
    if (query == null) {
      return fromJS(v);
    }
    const matches: any[] = [];
    for (const x of v) {
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
    const v = this.v;
    if (v == null) {
      return;
    }
    for (const x of v) {
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
  delete(_query): any {
    throw Error("not implemented");
  }

  // optional info about what changed going from prev to this.
  changes(_prev): any {
    throw Error("not implemented");
  }

  applyPatch(patch: any): Document {
    return this.apply_patch(patch);
  }

  applyPatchBatch(patches: any[]): Document {
    return this.apply_patch_batch(patches);
  }

  makePatch(doc: any): any {
    return this.make_patch(doc);
  }

  isEqual(doc?: any): boolean {
    return this.is_equal(doc);
  }

  getOne(query?: any): any {
    return this.get_one(query);
  }

  toString(): string {
    return this.to_str();
  }

  // how many in this document (length of string number of records in db-doc, etc.)
  count() {
    return this.v?.length ?? this.str.length;
  }
}
