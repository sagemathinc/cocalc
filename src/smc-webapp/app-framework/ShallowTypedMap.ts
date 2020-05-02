/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface ShallowTypedMap<TProps extends Record<string, any>> {
  size: number;

  // Reading values
  has(key: string): boolean;

  /**
   * Returns the value associated with the provided key, which may be the
   * default value defined when creating the Record factory function.
   *
   * If the requested key is not defined by this Record type, then
   * notSetValue will be returned if provided. Note that this scenario would
   * produce an error when using Flow or TypeScript.
   */
  get<K extends keyof TProps>(field: K): TProps[K];
  get<K extends keyof TProps, NSV>(field: K, notSetValue: NSV): TProps[K] | NSV;
  get<K extends keyof TProps>(key: K): TProps[K];
  get<K extends keyof TProps, NSV>(key: K, notSetValue: NSV): TProps[K] | NSV;
  get<K extends keyof TProps, NSV>(key: K, notSetValue?: NSV): TProps[K] | NSV;

  // Reading deep values
  hasIn(keyPath: Iterable<any>): boolean;
  getIn<NSV>(keyPath: Iterable<any>, notSetValue?: NSV): any;

  // Value equality
  equals(other: any): boolean;
  hashCode(): number;

  // Persistent changes
  set<K extends keyof TProps>(key: K, value: TProps[K]): this;
  update<K extends keyof TProps>(
    key: K,
    updater: (value: TProps[K]) => TProps[K]
  ): this;
  merge(...collections: Array<Partial<TProps> | Iterable<[string, any]>>): this;
  mergeDeep(
    ...collections: Array<Partial<TProps> | Iterable<[string, any]>>
  ): this;

  mergeWith(
    merger: (oldVal: any, newVal: any, key: keyof TProps) => any,
    ...collections: Array<Partial<TProps> | Iterable<[string, any]>>
  ): this;
  mergeDeepWith(
    merger: (oldVal: any, newVal: any, key: any) => any,
    ...collections: Array<Partial<TProps> | Iterable<[string, any]>>
  ): this;

  /**
   * Returns a new instance of this Record type with the value for the
   * specific key set to its default value.
   *
   * @alias remove
   */
  delete<K extends keyof TProps>(key: K): this;
  remove<K extends keyof TProps>(key: K): this;

  // Deep persistent changes
  setIn(keyPath: Iterable<any>, value: any): this;
  updateIn(keyPath: Iterable<any>, updater: (value: any) => any): this;
  mergeIn(keyPath: Iterable<any>, ...collections: Array<any>): this;
  mergeDeepIn(keyPath: Iterable<any>, ...collections: Array<any>): this;

  /**
   * @alias removeIn
   */
  deleteIn(keyPath: Iterable<any>): this;
  removeIn(keyPath: Iterable<any>): this;

  // Conversion to JavaScript types
  /**
   * Deeply converts this Record to equivalent native JavaScript Object.
   */
  toJS(): { [K in keyof TProps]: any };

  /**
   * Shallowly converts this Record to equivalent native JavaScript Object.
   */
  toJSON(): TProps;

  // Transient changes
  /**
   * Note: Not all methods can be used on a mutable collection or within
   * `withMutations`! Only `set` may be used mutatively.
   *
   * @see `Map#withMutations`
   */
  withMutations(mutator: (mutable: this) => any): this;

  /**
   * @see `Map#asMutable`
   */
  asMutable(): this;

  /**
   * @see `Map#wasAltered`
   */
  wasAltered(): boolean;

  /**
   * @see `Map#asImmutable`
   */
  asImmutable(): this;
}
