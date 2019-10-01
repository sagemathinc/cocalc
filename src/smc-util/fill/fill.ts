import { Assign } from "utility-types";
import { Restrict, Optionals } from "./types";

/**
 * props: T
 *  Given interface T with some optional parameters
 *  and defaults of only the optional parameters,
 *
 *  returns an object U where provided defaults are guaranteed
 *
 * Examples:
 *  props: {foo: string; bar?: string}, defaults: {bar: "good stuff"} => {foo: string; bar: string}
 *
 **/
export function fill<T extends object, U extends Optionals<T>>(
  props: T,
  defaults: Restrict<
    U,
    Optionals<T>,
    "Defaults cannot contain required values"
  >
): Assign<T, U> {
  const ret: U = {} as any;
  for (let key in defaults) {
    if (!props.hasOwnProperty(key) || props[key] == undefined) {
      ret[key] = defaults[key];
    }
  }
  return Object.assign({}, props, ret)
}
