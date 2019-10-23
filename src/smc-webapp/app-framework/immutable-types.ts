import { Collection, List, getIn as unsafe_getIn } from "immutable";
import { TypedMap } from "./TypedMap";

export type Maybe<T> = T | undefined;
// Return Maybe<U> iff T is a Maybe<?>
export type CopyMaybe<T, U> = Maybe<T> extends T ? Maybe<U> : U;
export type CopyAnyMaybe<T, U, V> = CopyMaybe<T, V> | CopyMaybe<U, V>;

type CoveredJSBuiltInTypes =
  | Date
  | Map<any, any>
  | Set<any>
  | WeakMap<any, any>
  | WeakSet<any>
  | Promise<any>
  | ArrayBuffer;

// Higher Kinded Types could make this generic.
// ie. if we could pass in an additional generic type U, then
// all objects could be U<T>
// As it is, right now that U<T> = TypeMap<T>
export type DeepImmutable<T> = T extends  // TODO: Make any non-plain-object retain it's type
  | Collection<any, any>
  | TypedMap<any>
  | CoveredJSBuiltInTypes
  ? T // Any of the types above should not be TypedMap-ified
  : T extends (infer U)[]
  ? ListToRecurse<U>
  : T extends object // Filter out desired objects above this line
  ? MapToRecurse<T>
  : T; // Base case primatives

// https://github.com/microsoft/TypeScript/issues/26980
type ListToRecurse<U> = {
  1: List<DeepImmutable<U>>;
  0: never;
}[U extends never ? 0 : 1];

type MapToRecurse<T extends object> = TypedMap<
  { [P in keyof T]: DeepImmutable<T[P]> }
>;
// Only works 3 levels deep.
// It's probably advisable to normalize your data if you find yourself that deep
// https://redux.js.org/recipes/structuring-reducers/normalizing-state-shape
// If you need to describe a recurse data structure such as a binary tree, use unsafe_getIn.
// Same code exists in Store.ts
export function getIn<T, K1 extends T extends { get: infer GET } ? GET : never>(
  collection: T,
  path: [K1]
): K1 extends () => infer V ? V : never;
export function getIn(collection, searchKeyPath, notSetValue?) {
  return unsafe_getIn(collection, searchKeyPath, notSetValue);
}
