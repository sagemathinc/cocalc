import { Assign } from "utility-types";
import { Restrict, Optionals } from "./types";

/**
 * Given an object: T with some optional parameters
 * and defaults: a subset of optional parameters from T.
 *
 * Explicitly setting a default to `undefined`is not recommended
 *
 * @return T except provided defaults are guaranteed
 *
 * @example
 *     props: {foo: string; bar?: string},
 *     defaults: {bar: "good stuff"}
 *        => {foo: string; bar: string} // <- Note bar is defined
 *
 *
 *     props: {foo: string; bar?: string; baz?: number},
 *     defaults: {bar: "good stuff"}
 *        => {foo: string; bar: string; baz?: number} // <- Note baz is optional
 * .
 **/
export function fill<T extends object, U extends Optionals<T>>(
  props: T,
  defaults: Restrict<U, Optionals<T>, "Defaults cannot contain required values">
): Assign<T, U> {
  const ret: U = {} as any;
  for (const key in defaults) {
    if (!props.hasOwnProperty(key) || props[key] == undefined) {
      ret[key] = defaults[key];
    }
  }
  return Object.assign({}, props, ret);
}
