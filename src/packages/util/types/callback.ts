/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Use this type to type the callback which is e.g. used in callback 2
export type CB<T = any, E = string | Error | null | undefined> = (
  err?: E,
  result?: T
) => any;
