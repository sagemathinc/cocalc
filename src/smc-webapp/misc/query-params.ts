/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Convenience functions for working with the query parameters in the URL.
*/

import * as query_string from "query-string";

export namespace QueryParams {
  export type Params = query_string.ParsedQuery<string>;

  export function get_all(): Params {
    // fallback for situations where the url is temporarily like …/app#projects/…?…
    if (location.hash?.length > 0 && location.search?.length == 0) {
      const i = location.hash.indexOf("?");
      if (i > 0) {
        return query_string.parse(location.hash.slice(i));
      }
    } else {
      return query_string.parse(location.search);
    }
    return {};
  }

  export function get(p: string) {
    return get_all()[p];
  }

  // Remove the given query parameter from the URL
  export function remove(p: string | string[]): void {
    const parsed = query_string.parse(location.search);
    if (typeof p != "string") {
      for (const x of p) {
        delete parsed[x];
      }
    } else {
      delete parsed[p];
    }
    set_query_params(parsed);
  }

  // val = undefined means to remove it, since won't be represented in query param anyways.
  export function set(
    p: string,
    val: string | string[] | null | undefined
  ): void {
    const parsed = query_string.parse(location.search);
    if (val === undefined) {
      // we don't really have to special case this, but I think this is clearer code.
      delete parsed[p];
    } else {
      parsed[p] = val;
    }
    set_query_params(parsed);
  }

  function set_query_params(parsed): void {
    const search = query_string.stringify(parsed);
    const i = window.location.href.indexOf("?");
    if (i !== -1) {
      window.history.pushState(
        "",
        "",
        window.location.href.slice(0, i + 1) + search
      );
    } else {
      window.history.pushState("", "", window.location.href + "?" + search);
    }
  }
}
