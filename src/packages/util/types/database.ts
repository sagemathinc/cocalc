/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CB } from "./callback";

export type UntypedQueryResult = { [key: string]: any };
export type QueryResult<T = UntypedQueryResult> = T;
export type QueryRows<T = UntypedQueryResult> = { rows: QueryResult<T>[] };

// and this for callbacks related to database queries
export type CBDB<T = UntypedQueryResult> = CB<QueryRows<T>>;

export type { CB };
