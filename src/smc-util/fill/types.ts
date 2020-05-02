/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { OptionalKeys } from "utility-types";

export type Optionals<T> = Pick<T, OptionalKeys<T>>;

/**
 * Throws a type error if T has keys not preset in TExpected
 *
 * Errors: `[T] is not assignable to [TError]`
 *
 * @see https://stackoverflow.com/questions/54775790/forcing-excess-property-checking-on-variable-passed-to-typescript-function
 */
export type Restrict<T, TExpected, TError> = T &
  (Exclude<keyof T, keyof TExpected> extends never ? {} : TError);
