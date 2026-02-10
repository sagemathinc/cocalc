/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CompressedPatch, Document, PatchValue } from "../generic/types";
import { apply_patch, make_patch } from "../generic/util";

const PATCH_SHAPE_CHECK_LIMIT = 4;

function isCompressedPatch(patch: PatchValue): patch is CompressedPatch {
  if (!Array.isArray(patch)) {
    return false;
  }
  // Tradeoff: do a fast bounded shape check here for resilience/CPU, and
  // rely on apply_patch to handle deeper malformed data as a no-op fallback.
  const n = Math.min(patch.length, PATCH_SHAPE_CHECK_LIMIT);
  for (let i = 0; i < n; i++) {
    const entry = patch[i];
    if (!Array.isArray(entry) || entry.length !== 5) {
      return false;
    }
  }
  return true;
}

// Immutable string document that satisfies our spec.
export class StringDocument implements Document {
  private value: string;

  constructor(value = "") {
    this.value = value;
  }

  public to_str(): string {
    return this.value;
  }

  public is_equal(other: StringDocument): boolean;
  public is_equal(other: undefined): boolean;
  public is_equal(): boolean;
  public is_equal(other?: Document): boolean {
    return other instanceof StringDocument && this.value === other.value;
  }

  public apply_patch(patch: CompressedPatch): StringDocument;
  public apply_patch(patch: PatchValue): StringDocument {
    if (!isCompressedPatch(patch)) {
      throw Error("patch must be a compressed string patch");
    }
    return new StringDocument(apply_patch(patch, this.value)[0]);
  }

  public make_patch(other: StringDocument): CompressedPatch;
  public make_patch(other: Document): CompressedPatch {
    if (!(other instanceof StringDocument)) {
      throw Error("other must be a StringDocument");
    }
    return make_patch(this.value, other.value);
  }

  public set(x: any): StringDocument {
    if (typeof x === "string") {
      return new StringDocument(x);
    }
    throw Error("x must be a string");
  }

  public get(_?: any): any {
    throw Error("get queries on strings don't have meaning");
  }

  public get_one(_?: any): any {
    throw Error("get_one queries on strings don't have meaning");
  }

  public delete(_?: any): StringDocument {
    throw Error("delete on strings doesn't have meaning");
  }

  public changes(_?: StringDocument): any;
  public changes(_?: Document): any {
    // no-op (this is useful for other things, e.g., db-doc)
    return;
  }

  public count(): number {
    return this.value.length;
  }
}
