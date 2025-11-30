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
    return super.toString();
  }

  public override toString(): string {
    return "[object Object]";
  }

  public override isEqual(other?: PFStringDocument): boolean {
    return super.isEqual(other);
  }

  public is_equal(other?: Document): boolean {
    return this.isEqual(other as PFStringDocument | undefined);
  }

  public override applyPatch(patch: CompressedPatch): StringDocument {
    return this.wrap(super.applyPatch(patch));
  }

  public apply_patch(patch: any): StringDocument {
    return this.applyPatch(patch);
  }

  public override makePatch(other: PFStringDocument): CompressedPatch {
    return super.makePatch(other);
  }

  public make_patch(other: Document): CompressedPatch {
    return this.makePatch(other as unknown as PFStringDocument);
  }

  public get_one(_?: unknown): never {
    throw new Error("get_one queries on strings don't have meaning");
  }

  public override get(_?: unknown): never {
    throw new Error("get queries on strings don't have meaning");
  }

  public override set(x: unknown): StringDocument {
    if (typeof x !== "string") {
      throw new Error("must be a string");
    }
    return this.wrap(super.set(x));
  }

  public override delete(_?: unknown): never {
    throw new Error("delete on strings doesn't have meaning");
  }

  public changes(_?: any): any {
    return;
  }
}
