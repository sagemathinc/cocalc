/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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
type Copy4Maybes<T0, T1, T2, T3, V> =
  | CopyMaybe<T0, V>
  | CopyMaybe<T1, V>
  | CopyMaybe<T2, V>
  | CopyMaybe<T3, V>;

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
  ? TypedMap<{ [P in keyof T]: DeepImmutable<T[P]> }>
  : T; // Base case primatives

// https://github.com/microsoft/TypeScript/issues/26980
type ListToRecurse<U> = {
  1: Immutable.List<DeepImmutable<U>>;
  0: never;
}[U extends never ? 0 : 1];

/**
 * Returns type V of "getting" K from T
 * Order of precendence:
 * 1. `TypedMap<{K: V}>`
 * 1. `{ get: (key: K) => V }`
 * 1. `V = T[K]`
 *
 */
type Get<T, K extends ValidKey> = T extends TypedMap<infer TP>
  ? K extends keyof TP
    ? TP[K]
    : never
  : T extends { get: infer get }
  ? get extends (key: K) => infer V
    ? V
    : never
  : K extends keyof T
  ? T[K]
  : undefined; // The real behavior on undefined members is undefined

type Drill2Get<T, K1 extends ValidKey, K2 extends ValidKey> = Get<
  Get<T, K1>,
  K2
>;
type Drill3Get<
  T,
  K1 extends ValidKey,
  K2 extends ValidKey,
  K3 extends ValidKey
> = Get<Drill2Get<T, K1, K2>, K3>;
type Drill4Get<
  T,
  K1 extends ValidKey,
  K2 extends ValidKey,
  K3 extends ValidKey,
  K4 extends ValidKey
> = Get<Drill3Get<T, K1, K2, K3>, K4>;
type Drill5Get<
  T,
  K1 extends ValidKey,
  K2 extends ValidKey,
  K3 extends ValidKey,
  K4 extends ValidKey,
  K5 extends ValidKey
> = Get<Drill4Get<T, K1, K2, K3, K4>, K5>;

/**
 *  1. immutable.js allows any type as keys but we're not dealing with that
 *  2. Prevents widening https://github.com/Microsoft/TypeScript/pull/10676
 *  3. Numbers technically can't be keys but are coerced to strings
 */
type ValidKey = string | number | symbol;

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
  get<K extends ValidKey>(field: K): DeepImmutable<Get<TProps, K>>;
  get<K extends ValidKey, NSV>(
    field: K,
    notSetValue: NSV
  ): NonNullable<DeepImmutable<Get<TProps, K>>> | NSV;

  /**
   * Returns the value associated with the provided keypath in TProps
   *
   * If any part of the path returns undefined, then
   * notSetValue will be returned if provided. Note this
   * returns notSetValue even if the target is allowed to be undefined by
   * its type.
   *
   * @param path: key[] max length: 5
   * @param notSetValue?: any
   */
  // Only works 5 levels deep.
  // It's probably advisable to normalize your data if you find yourself any deeper
  // https://redux.js.org/recipes/structuring-reducers/normalizing-state-shape
  // Recurse data structure such as a binary tree are currently not supported
  getIn<K1 extends ValidKey>(path: [K1]): DeepImmutable<Get<TProps, K1>>;
  getIn<K1 extends ValidKey, K2 extends ValidKey>(
    path: [K1, K2]
  ): DeepImmutable<CopyMaybe<Get<TProps, K1>, Drill2Get<TProps, K1, K2>>>;
  getIn<K1 extends ValidKey, K2 extends ValidKey, K3 extends ValidKey>(
    path: [K1, K2, K3]
  ): DeepImmutable<
    Copy2Maybes<
      Get<TProps, K1>,
      Drill2Get<TProps, K1, K2>,
      Drill3Get<TProps, K1, K2, K3>
    >
  >;
  getIn<
    K1 extends ValidKey,
    K2 extends ValidKey,
    K3 extends ValidKey,
    K4 extends ValidKey
  >(
    path: [K1, K2, K3, K4]
  ): DeepImmutable<
    Copy3Maybes<
      Get<TProps, K1>,
      Drill2Get<TProps, K1, K2>,
      Drill3Get<TProps, K1, K2, K3>,
      Drill4Get<TProps, K1, K2, K3, K4>
    >
  >;
  getIn<
    K1 extends ValidKey,
    K2 extends ValidKey,
    K3 extends ValidKey,
    K4 extends ValidKey,
    K5 extends ValidKey
  >(
    path: [K1, K2, K3, K4, K5]
  ): DeepImmutable<
    Copy4Maybes<
      Get<TProps, K1>,
      Drill2Get<TProps, K1, K2>,
      Drill3Get<TProps, K1, K2, K3>,
      Drill4Get<TProps, K1, K2, K3, K4>,
      Drill5Get<TProps, K1, K2, K3, K4, K5>
    >
  >;
  getIn<K1 extends ValidKey, NSV>(
    path: [K1],
    notSetValue: NSV
  ): NonNullable<DeepImmutable<Get<TProps, K1>>> | NSV;
  getIn<K1 extends ValidKey, K2 extends ValidKey, NSV>(
    path: [K1, K2],
    notSetValue: NSV
  ): NonNullable<DeepImmutable<Drill2Get<TProps, K1, K2>>> | NSV;
  getIn<K1 extends ValidKey, K2 extends ValidKey, K3 extends ValidKey, NSV>(
    path: [K1, K2, K3],
    notSetValue: NSV
  ): NonNullable<DeepImmutable<Drill3Get<TProps, K1, K2, K3>>> | NSV;
  getIn<
    K1 extends ValidKey,
    K2 extends ValidKey,
    K3 extends ValidKey,
    K4 extends ValidKey,
    NSV
  >(
    path: [K1, K2, K3, K4],
    notSetValue: NSV
  ): NonNullable<DeepImmutable<Drill4Get<TProps, K1, K2, K3, K4>>> | NSV;
  getIn<
    K1 extends ValidKey,
    K2 extends ValidKey,
    K3 extends ValidKey,
    K4 extends ValidKey,
    K5 extends ValidKey,
    NSV
  >(
    path: [K1, K2, K3, K4, K5],
    notSetValue: NSV
  ): NonNullable<DeepImmutable<Drill5Get<TProps, K1, K2, K3, K4, K5>>> | NSV;
}
