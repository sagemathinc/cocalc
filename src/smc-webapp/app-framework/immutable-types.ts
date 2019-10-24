import * as Immutable from "immutable";
import { TypedMap } from "./TypedMap";

type Maybe<T> = T | undefined;
// Return Maybe<U> iff T is a Maybe<?>
type CopyMaybe<T, U> = Maybe<T> extends T ? Maybe<U> : U;
// Could be shortened with Variadic Types?
type Copy2Maybes<T, U, V> = CopyMaybe<T, V> | CopyMaybe<U, V>;
type Copy3Maybes<T0, T1, T2, V> =
  | CopyMaybe<T0, V>
  | CopyMaybe<T1, V>
  | CopyMaybe<T2, V>;

type NonNullable1<Top, K1 extends keyof Top> = NonNullable<Top[K1]>;
type NonNullable2<
  Top,
  K1 extends keyof Top,
  K2 extends keyof NonNullable1<Top, K1>
> = NonNullable<NonNullable1<Top, K1>[K2]>;
type NonNullable3<
  Top,
  K1 extends keyof Top,
  K2 extends keyof NonNullable1<Top, K1>,
  K3 extends keyof NonNullable2<Top, K1, K2>
> = NonNullable<NonNullable2<Top, K1, K2>[K3]>;

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
  | Immutable.Collection<any, any>
  | TypedMap<any>
  | CoveredJSBuiltInTypes
  ? T // Any of the types above should not be TypedMap-ified
  : T extends (infer U)[]
  ? ListToRecurse<U> // Converts values of arrays as well
  : T extends object // Filter out desired objects above this line
  ? MapToRecurse<T>
  : T; // Base case primatives

// https://github.com/microsoft/TypeScript/issues/26980
type ListToRecurse<U> = {
  1: Immutable.List<DeepImmutable<U>>;
  0: never;
}[U extends never ? 0 : 1];

type MapToRecurse<T extends object> = TypedMap<
  { [P in keyof T]: DeepImmutable<T[P]> }
>;

// There has to be a better way to move across TypedMap/immutable.Map boundaries...
type Value<T> = T extends Immutable.Map<string, infer V>
  ? V
  : T extends Immutable.List<infer V>
  ? V
  : never;
type State<T> = T extends TypedMap<infer TP> ? TP : never;
type KState<T> = T extends TypedMap<infer TP> ? keyof TP : never;

type Get<T, K> = T extends TypedMap<infer TP>
  ? K extends keyof TP
    ? TP[K]
    : never
  : T extends { get: infer get }
  ? get extends (key: K) => infer V
    ? V
    : never
  : K extends keyof T
  ? T[K]
  : never;

/**
 * Provides an interface for immutable methods on a structure defined by
 * TProps. Return types are always their immutable counterparts.
 * Values of arrays and object literals are deeply converted to immutable.
 * Values which extend immutable.Collection<K, V> are ignored and not converted.
 * JS built in classes are also not converted eg. Date, WeakMap, WeakSet, etc.
 *
 * Conversions:
 * Object literal ->TypedMap
 * Array<U> -> List<converted<U>>
 *
 * Preserved:
 * Map<K, V>, List<U>, Date, WeakMap, and more
 *
 */
export interface TypedCollectionMethods<TProps> {
  /**
   * Returns the value associated with the provided key.
   *
   * If the requested key is undefined, then
   * notSetValue will be returned if provided.
   */
  get<K extends keyof TProps>(field: K): DeepImmutable<TProps[K]>;
  get<K extends keyof TProps, NSV>(
    field: K,
    notSetValue: NSV
  ): NonNullable<DeepImmutable<TProps[K]>> | NSV;
  get<K extends keyof TProps>(key: K): TProps[K];
  get<K extends keyof TProps, NSV>(
    key: K,
    notSetValue: NSV
  ): NonNullable<TProps[K]> | NSV;
  get<K extends keyof TProps, NSV>(key: K, notSetValue?: NSV): TProps[K] | NSV;

  // Only works 4 levels deep.
  // It's probably advisable to normalize your data if you find yourself that deep
  // https://redux.js.org/recipes/structuring-reducers/normalizing-state-shape
  // If you need to describe a recurse data structure such as a binary tree, use unsafe_getIn.
  getIn<K1 extends KState<TProps>>(path: [K1]): Get<TProps, K1>; // TProps is a TypedMap
  getIn<K1 extends keyof TProps>(path: [K1]): DeepImmutable<TProps[K1]>; // TProps is a obj lit or array
  getIn<K1>(path: [K1]): Get<TProps, K1>; // TProps is anything else.
  getIn<K1 extends keyof TProps, K2 extends KState<TProps[K1]>>(
    path: [K1, K2]
  ): DeepImmutable<CopyMaybe<TProps[K1], Get<TProps[K1], K2>>>;
  getIn<K1 extends keyof TProps, K2 extends keyof NonNullable1<TProps, K1>>(
    path: [K1, K2]
  ): DeepImmutable<CopyMaybe<TProps[K1], NonNullable1<TProps, K1>[K2]>>;
  getIn<K1 extends keyof TProps, K2>( // K2 Unknown
    path: [K1, K2]
  ): DeepImmutable<Get<TProps[K1], K2>>;
  getIn<
    K1 extends keyof TProps,
    K2 extends keyof NonNullable1<TProps, K1>,
    K3 extends keyof NonNullable2<TProps, K1, K2>
  >(
    path: [K1, K2, K3]
  ): DeepImmutable<
    Copy2Maybes<
      TProps[K1],
      NonNullable1<TProps, K1>[K2],
      NonNullable2<TProps, K1, K2>[K3]
    >
  >;
  getIn<
    // Operating on TypedMap<{ foo: immutable.Map<K2, V}> where V: TypedMap<any>
    K1 extends keyof TProps,
    K2 extends string, // Key type of Map<string, unknown>
    K3 extends keyof State<Value<NonNullable1<TProps, K1>>>
  >(
    path: [K1, K2, K3]
  ): DeepImmutable<
    Copy2Maybes<
      TProps[K1],
      Value<NonNullable1<TProps, K1>>,
      NonNullable<State<Value<NonNullable1<TProps, K1>>>[K3]>
    >
  >;
  getIn<
    K4 extends keyof NonNullable3<TProps, K1, K2, K3>,
    K1 extends keyof TProps,
    K2 extends keyof NonNullable1<TProps, K1>,
    K3 extends keyof NonNullable2<TProps, K1, K2>
  >(
    path: [K1, K2, K3, K4]
  ): DeepImmutable<
    Copy3Maybes<
      TProps[K1],
      NonNullable1<TProps, K1>[K2],
      NonNullable2<TProps, K1, K2>[K3],
      NonNullable3<TProps, K1, K2, K3>[K4]
    >
  >;
  getIn<K1 extends keyof TProps, NSV>(
    path: [K1],
    notSetValue: NSV
  ): NonNullable<DeepImmutable<TProps[K1]>> | NSV;
  getIn<
    K1 extends keyof TProps,
    K2 extends keyof NonNullable1<TProps, K1>,
    NSV
  >(
    path: [K1, K2],
    notSetValue: NSV
  ): DeepImmutable<NonNullable1<TProps, K1>[K2]> | NSV;
  getIn<K1 extends keyof TProps, K2 extends string, NSV>( // Operating on TypedMap<{ foo: immutable.Map<K2, V> }>
    path: [K1, K2],
    NotSetValue: NSV
  ): NonNullable<DeepImmutable<Value<NonNullable1<TProps, K1>>>> | NSV;
  getIn<
    K1 extends keyof TProps,
    K2 extends keyof NonNullable1<TProps, K1>,
    K3 extends keyof NonNullable2<TProps, K1, K2>,
    NSV
  >(
    path: [K1, K2, K3],
    notSetValue: NSV
  ): DeepImmutable<NonNullable2<TProps, K1, K2>[K3]> | NSV;
  getIn<
    K1 extends keyof TProps,
    K2 extends keyof NonNullable1<TProps, K1>,
    K3 extends keyof NonNullable2<TProps, K1, K2>,
    K4 extends keyof NonNullable3<TProps, K1, K2, K3>,
    NSV
  >(
    path: [K1, K2, K3, K4],
    notSetValue: NSV
  ): DeepImmutable<NonNullable3<TProps, K1, K2, K3>[K4]> | NSV;
}
