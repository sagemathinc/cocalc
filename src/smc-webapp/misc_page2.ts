// functions ported from misc_page.coffee

import * as query_string from "query-string";

// see entry-point, and via this useful in all TS files
declare global {
  interface Window {
    COCALC_FULLSCREEN: string | undefined;
    COCALC_MINIMAL: boolean;
  }
}

export namespace QueryParams {
  export type Params = query_string.ParsedQuery<string>;

  export function get_all(): Params {
    return query_string.parse(location.search);
  }

  export function get(p: string) {
    return get_all()[p];
  }

  // Remove the given query parameter from the URL
  export function remove(p: string): void {
    this.set(p, undefined);
  }

  // val = undefined means to remove it, since won't be represented in query param anyways.
  export function set(
    p: string,
    val: string | string[] | null | undefined
  ): void {
    const parsed = query_string.parse(location.search);
    if (val === undefined) { // we don't really have to special case this, but I think this is clearer code.
      delete parsed[p];
    } else {
      parsed[p] = val;
    }
    const search = query_string.stringify(parsed);
    const i = window.location.href.indexOf("?");
    if (i !== -1) {
      window.history.pushState(
        "",
        "",
        window.location.href.slice(0, i) + "?" + search
      );
    } else {
      window.history.pushState("", "", window.location.href + "?" + search);
    }
  }
}
