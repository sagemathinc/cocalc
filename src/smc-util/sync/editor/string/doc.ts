import { CompressedPatch, Document } from "../generic/types";
import { apply_patch, make_patch } from "../generic/util";

// Immutable string document that satisfies our spec.
export class StringDocument implements Document {
  private value: string;

  constructor(value = "") {
    this.value = value;
  }

  public to_str(): string {
    return this.value;
  }

  public is_equal(other?: StringDocument): boolean {
    return this.value === (other != null ? other.value : undefined);
  }

  public apply_patch(patch: CompressedPatch): StringDocument {
    return new StringDocument(apply_patch(patch, this.value)[0]);
  }

  public make_patch(other: StringDocument): CompressedPatch {
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

  public changes(_?: StringDocument): any {
    // no-op (this is useful for other things, e.g., db-doc)
    return;
  }

  public count(): number {
    return this.value.length;
  }
}
