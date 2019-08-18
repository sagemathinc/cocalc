// functions ported from misc_page.coffee

// see entry-point, and via this useful in all TS files
declare global {
  interface Window {
    COCALC_FULLSCREEN: string | undefined;
    COCALC_MINIMAL: boolean;
  }
}

export namespace QueryParams {
  export interface Params {
    [k: string]: string | boolean | (string | boolean)[];
  }

  /* read the query string of the URL and transform it to a key/value map
   * based on: https://stackoverflow.com/a/4656873/54236
   * the main difference is that multiple identical keys are collected in an array
   * test: check that /app?fullscreen&a=1&a=4 gives {fullscreen : true, a : [1, 4]}
   * NOTE: the comments on that stackoverflow are very critical of this; in particular,
   * there's no URI decoding, so I added that below...
   *
   * Example: URL ending in  "?session=default&x=123&x=foo&launch=foo"
   *          transformed to {"session":"default","x":["123","foo"],"launch":"foo"}
   */
  export function get_all(): Params {
    const vars: Params = {};
    const { href } = window.location;
    const parts = Array.from(href.slice(href.indexOf("?") + 1).split("&"));
    for (const part of parts) {
      const [k, v_enc] = Array.from(part.split("="));
      const v = decodeURIComponent(v_enc);
      // if key is already set, change to array and add the value
      if (vars[k] != null) {
        const val = vars[k];
        let val_new: (boolean | string)[] = [];
        if (!Array.isArray(val)) {
          val_new = [val];
        }
        vars[k] = val_new.concat(v);
      } else {
        vars[k] = v != null ? v : true;
      }
    }
    return vars;
  }

  export function get(p: string) {
    return get_all()[p];
  }
}
