import { Collection, List } from "immutable";
import { TypedMap } from "./TypedMap";


export type Maybe<T> = T | undefined;
// Return Maybe<U> iff T is a Maybe<?>
export type CopyMaybe<T, U> = Maybe<T> extends T ? Maybe<U> : U;
export type CopyAnyMaybe<T, U, V> = CopyMaybe<T, V> | CopyMaybe<U, V>;

// Higher Kinded Types could make this generic.
// ie. if we could pass in an additional generic type U, then
// all objects could be U<T>
// As it is, right now that U<T> = TypeMap<T>
export type DeepImmutable<T> = T extends Collection<any, any>
  ? T // Any immutable.js data structure
  : T extends (infer U)[]
  ? List<U>
  : T extends object // Filter out desired objects above this line
  ? MapToRecurse<T>
  : T; // Base case primatives

type MapToRecurse<T extends object> = TypedMap<
  { [P in keyof T]: DeepImmutable<T[P]> }
>;
