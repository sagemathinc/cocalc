import { OptionalKeys } from "utility-types";

export type Optionals<T> = Pick<T, OptionalKeys<T>>;

/**
 * Throws a type error if T has keys not preset in TExpected
 *
 * Errors: `[T] is not assignable to [TError]`
 */
export type Restrict<T, TExpected, TError> = T &
  (Exclude<keyof T, keyof TExpected> extends never ? {} : TError);
