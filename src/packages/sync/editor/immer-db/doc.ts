/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  DbDocumentImmer as PFDbDocument,
  type DbPatch,
  type SetCondition,
  type WhereCondition,
  fromImmerString,
} from "patchflow";
import type { Document } from "../generic/types";

// Thin wrapper around patchflow's immer db document to preserve the legacy API names.
export class ImmerDBDocument extends PFDbDocument implements Document {
  private wrap(doc: PFDbDocument): ImmerDBDocument {
    if (doc instanceof ImmerDBDocument) {
      return doc;
    }
    Object.setPrototypeOf(doc, ImmerDBDocument.prototype);
    return doc as ImmerDBDocument;
  }

  public to_str(): string {
    return super.toString();
  }

  public override toString(): string {
    return "[object Object]";
  }

  public override isEqual(other?: PFDbDocument): boolean {
    return super.isEqual(other);
  }

  public is_equal(other?: Document): boolean {
    if (other == null) return false;
    const otherStr =
      other instanceof ImmerDBDocument
        ? other.to_str()
        : (other as unknown as PFDbDocument).toString();
    return this.to_str() === otherStr;
  }

  public override applyPatch(patch: unknown): ImmerDBDocument {
    return this.wrap(super.applyPatch(patch as DbPatch) as PFDbDocument);
  }

  public apply_patch(patch: any): ImmerDBDocument {
    return this.applyPatch(patch);
  }

  public override applyPatchBatch(patches: unknown[]): ImmerDBDocument {
    return this.wrap(
      super.applyPatchBatch(patches as DbPatch[]) as PFDbDocument,
    );
  }

  public apply_patch_batch(patches: any[]): ImmerDBDocument {
    return this.applyPatchBatch(patches);
  }

  public override get(where?: unknown): any {
    return super.get(where);
  }

  public override set(obj: unknown): ImmerDBDocument {
    return this.wrap(super.set(obj) as PFDbDocument);
  }

  public override delete(where?: unknown): ImmerDBDocument {
    return this.wrap(super.delete(where) as PFDbDocument);
  }

  public override makePatch(other: PFDbDocument): DbPatch {
    return super.makePatch(other);
  }

  public make_patch(other: Document): DbPatch {
    return this.makePatch(other as unknown as PFDbDocument);
  }

  public get_one(where?: unknown): any {
    return super.getOne(where);
  }
}

export function from_str(
  s: string,
  primary_keys: string[] | Set<string> = [],
  string_cols: string[] | Set<string> = [],
): ImmerDBDocument {
  const pk = primary_keys instanceof Set ? primary_keys : new Set(primary_keys);
  const sc = string_cols instanceof Set ? string_cols : new Set(string_cols);
  const doc = fromImmerString(s, pk, sc) as PFDbDocument;
  Object.setPrototypeOf(doc, ImmerDBDocument.prototype);
  return doc as unknown as ImmerDBDocument;
}

export type { DbPatch, WhereCondition, SetCondition };
