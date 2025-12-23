/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import * as misc from "@cocalc/util/misc";

const { defaults } = misc;
const required = defaults.required;

export type CancelUserQueriesOptions = {
  client_id: string;
};

type CancelUserQueriesContext = {
  _user_query_queue?: {
    cancel_user_queries: (opts: CancelUserQueriesOptions) => void;
  };
};

export function cancelUserQueries(
  db: CancelUserQueriesContext,
  opts: CancelUserQueriesOptions,
): void {
  const normalized = defaults(opts, { client_id: required }) as
    | CancelUserQueriesOptions
    | undefined;
  if (normalized == null) {
    return;
  }
  db._user_query_queue?.cancel_user_queries(normalized);
}
