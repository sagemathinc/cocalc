/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export type UntypedQueryResult = { [key: string]: any };
export type QueryResult<T = UntypedQueryResult> = T;
export type QueryRows<T = UntypedQueryResult> = { rows: QueryResult<T>[] };

// Use this type to type the callback which is e.g. used in callback 2
export type CB<T = any> = (
  err?: string | Error | null | undefined,
  result?: T
) => any;

// and this for callbacks related to database queries
export type CBDB<T = UntypedQueryResult> = CB<QueryRows<T>>;
