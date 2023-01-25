/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Use this type to type the callback used for the database callback2 calls.
export type CB<T = any> = (
  err?: string | Error | null | undefined,
  result?: T
) => any;
