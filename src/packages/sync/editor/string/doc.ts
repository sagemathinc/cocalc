/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { StringDocument as PFStringDocument, type CompressedPatch } from "patchflow";
import type { Document } from "../generic/types";

// Thin wrapper around patchflow's StringDocument to satisfy the legacy interface.
export class StringDocument extends PFStringDocument implements Document {
  private wrap(doc: PFStringDocument): StringDocument {
    return doc instanceof StringDocument ? (doc as StringDocument) : new StringDocument(doc.toString());
  }

  public to_str(): string {
    return this.toString();
  }

  public is_equal(other?: PFStringDocument): boolean {
    return this.isEqual(other);
  }

  public apply_patch(patch: CompressedPatch): StringDocument {
    return this.wrap(super.applyPatch(patch));
  }

  public make_patch(other: StringDocument): CompressedPatch {
    return super.makePatch(other as PFStringDocument);
  }

  public get_one(_?: any): any {
    throw new Error("get_one queries on strings don't have meaning");
  }

  public get(_?: any): any {
    throw new Error("get queries on strings don't have meaning");
  }

  public set(x: any): StringDocument {
    return this.wrap(super.set(x));
  }

  public delete(_?: any): StringDocument {
    throw new Error("delete on strings doesn't have meaning");
  }

  public changes(_?: StringDocument): any {
    return;
  }
}
