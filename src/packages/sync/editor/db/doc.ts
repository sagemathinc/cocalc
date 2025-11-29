/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  DbDocument as PFDbDocument,
  type DbPatch,
  type SetCondition,
  type WhereCondition,
  fromString as fromPatchflowString,
} from "patchflow";
import type { Document } from "../generic/types";

// Thin wrapper around patchflow's immutable db document to preserve the legacy API names.
export class DBDocument extends PFDbDocument implements Document {
  private wrap(doc: PFDbDocument): DBDocument {
    if (doc instanceof DBDocument) {
      return doc;
    }
    Object.setPrototypeOf(doc, DBDocument.prototype);
    return doc as DBDocument;
  }

  public to_str(): string {
    return super.toString();
  }

  public override toString(): string {
    return "[object Object]";
  }

  public is_equal(other?: PFDbDocument): boolean {
    if (other == null) return false;
    const otherStr =
      other instanceof DBDocument
        ? other.to_str()
        : (other as PFDbDocument).toString();
    return this.to_str() === otherStr;
  }

  public apply_patch(patch: DbPatch): DBDocument {
    return this.wrap(super.applyPatch(patch) as PFDbDocument);
  }

  public set(obj: unknown): DBDocument {
    return this.wrap(super.set(obj) as PFDbDocument);
  }

  public delete(where?: unknown): DBDocument {
    return this.wrap(super.delete(where) as PFDbDocument);
  }

  public make_patch(other: DBDocument): DbPatch {
    return super.makePatch(other as PFDbDocument);
  }

  public get_one(where?: unknown): unknown {
    return super.getOne(where);
  }
}

export function from_str(
  s: string,
  primary_keys: string[] | Set<string> = [],
  string_cols: string[] | Set<string> = [],
): DBDocument {
  const pk = primary_keys instanceof Set ? primary_keys : new Set(primary_keys);
  const sc = string_cols instanceof Set ? string_cols : new Set(string_cols);
  const doc = fromPatchflowString(s, pk, sc) as PFDbDocument;
  Object.setPrototypeOf(doc, DBDocument.prototype);
  return doc as DBDocument;
}

export type { DbPatch, WhereCondition, SetCondition };
