/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Convenience functions for working with the query parameters in the URL.
*/

// Import this to ensure that the query params have been restored.
import "@cocalc/frontend/client/handle-target";

export namespace QueryParams {
  export function get(p: string): string | null {
    return new URL(location.href).searchParams.get(p);
  }

  // Remove the given query parameter from the URL
  export function remove(p: string | string[]): void {
    // console.log("QueryParams.remove", p);
    const url = new URL(location.href);
    if (typeof p != "string") {
      for (const x of p) {
        url.searchParams.delete(x);
      }
    } else {
      url.searchParams.delete(p);
    }
    history.pushState({}, "", url.href);
  }

  // val = undefined means to remove it, since won't be represented in query param anyways.
  export function set(p: string, val: string | null | undefined): void {
    // console.log("QueryParams.set", { p, val });
    const url = new URL(location.href);
    if (val == null) {
      url.searchParams.delete(p);
    } else {
      url.searchParams.set(p, val);
    }
    history.pushState({}, "", url.href);
  }
}
