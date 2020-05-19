/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Assign, RequiredKeys } from "utility-types";
import { Optionals } from "./types";

type Requireds<T> = Pick<T, RequiredKeys<T>>;

export const required = "__!!!!!!this is a required property!!!!!!__";

type Definition<T> = {
  [K in keyof T]: {} extends Pick<T, K> ? T[K] : typeof required;
};

/**
 * `define<T, U>(props: unknown, definition)`
 * Guarantees at runtime that `props` matches `definition`
 * `U` must only be the optional params on `T`
 *
 * @return {object} T where provided defaults are guaranteed
 *
 * @example
 *
 *     define<{name: string,
 *              highlight?: boolean,
 *              last?: string},
 *           {highlight: boolean}>(unknown_prop, {highlight: false});
 *
 * Unfortunately you must use both type annotations until this goes through
 * https://github.com/microsoft/TypeScript/issues/26242
 *
 **/
export function define<T>(props: unknown, definition: Definition<T>): T;
export function define<T extends object, U extends Optionals<T>>(
  props: unknown,
  definition: Assign<Definition<T>, U>,
  allow_extra?: boolean,
  strict?: boolean
): Assign<U, Requireds<T>>;
export function define<T extends object, U extends Optionals<T>>(
  props: unknown,
  definition: Assign<Definition<T>, U>,
  allow_extra = false,
  strict = false
): Assign<U, Requireds<T>> {
  // We put explicit traces before the errors in this function,
  // since otherwise they can be very hard to debug.
  function maybe_error(message: string): any {
    const err = `${message} ${error_addendum(props, definition)}`;
    if (strict) {
      throw new Error(err);
    } else {
      console.log(err);
      console.trace();
      return definition as any;
    }
  }

  if (props == undefined) {
    props = {};
  }
  // Undefined was checked above but TS 3.6.3 is having none of it.
  // Checking here makes TS work as expected below
  if (typeof props !== "object" || props == undefined) {
    return maybe_error(
      `BUG -- Traceback -- misc.defaults -- TypeError: function takes inputs as an object`
    );
  }
  const result: Assign<U, Requireds<T>> = {} as any;
  for (const key in definition) {
    if (props.hasOwnProperty(key) && props[key] != undefined) {
      if (definition[key] === required && props[key] == undefined) {
        return maybe_error(
          `misc.defaults -- TypeError: property '${key}' must be specified on props:`
        );
      }
      result[key] = props[key];
    } else if (definition[key] != undefined) {
      if (definition[key] == required) {
        maybe_error(
          `misc.defaults -- TypeError: property '${key}' must be specified:`
        );
      } else {
        result[key] = definition[key];
      }
    }
  }

  if (!allow_extra) {
    for (const key in props) {
      if (!definition.hasOwnProperty(key)) {
        return maybe_error(
          `misc.defaults -- TypeError: got an unexpected argument '${key}'`
        );
      }
    }
  }
  return result;
}

function error_addendum(props: unknown, definition: unknown) {
  try {
    return `(obj1=${exports.trunc(
      exports.to_json(props),
      1024
    )}, obj2=${exports.trunc(exports.to_json(definition), 1024)})`;
  } catch (err) {
    return "";
  }
}
