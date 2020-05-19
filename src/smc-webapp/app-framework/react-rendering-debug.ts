/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

declare let smc, performance;

export enum MODES {
  count = "count", // collect count of number of times each component is rendered; call get_render_count and reset_render_count to see.
  time = "time", // show every single component render and how long it took
  verbose = "verbose", // print every CoCalc component that is rendered when rendered
  trace = "trace", // print only components that take some time, along with timing info
  default = "default", // Do nothing extra
}

// to make typescript happy (TS2339 & co)
interface TBase {
  render: any;
  _render: any;
  displayName: string;
}

export function debug_transform<T extends (...args: any[]) => any>(
  rclass: T,
  mode = MODES.default
): T {
  if (typeof smc === "undefined" || smc === null) {
    return rclass; // do not enable debugging in prod
  }

  if (mode !== "default") {
    console.log(`app-framework debug_transform MODE='${mode}'`);
  }

  let composed_rclass;
  switch (mode) {
    case "count":
      // Use these in the console:
      //  smc.reset_render_count()
      //  JSON.stringify(smc.get_render_count())
      let render_count: { [key: string]: number } = {};
      composed_rclass = function <T extends TBase>(x: T): T {
        x._render = x.render;
        x.render = function (): ReturnType<T["render"]> {
          render_count[x.displayName] =
            (render_count[x.displayName] != null
              ? render_count[x.displayName]
              : 0) + 1;
          return this._render();
        };
        return rclass(x);
      };
      smc.get_render_count = function (): {
        counts: { [key: string]: number };
        total: number;
      } {
        let total = 0;
        for (const k in render_count) {
          const v = render_count[k];
          total += v;
        }

        return { counts: render_count, total };
      };
      smc.reset_render_count = function (): void {
        render_count = {};
      };
      break;
    case "time":
      composed_rclass = <T>(x: T): T => {
        const t0 = performance.now();
        const r = rclass(x);
        const t1 = performance.now();
        if (t1 - t0 > 1) {
          console.log(r.displayName, "took", t1 - t0, "ms of time");
        }
        return r;
      };
      break;
    case "verbose":
      composed_rclass = function <
        T extends {
          render: (...args: any[]) => JSX.Element;
          displayName?: string;
        }
      >(x: T): T & { _render: T["render"] } {
        (x as any)._render = x.render;
        x.render = function (): JSX.Element {
          console.log(x.displayName);
          return this._render();
        };
        return rclass(x);
      };
      break;
    case "trace":
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { react_debug_trace } = require("../app-framework-debug");
      composed_rclass = react_debug_trace(rclass);
      break;
    case "default":
      composed_rclass = rclass;
      break;
    default:
      throw Error(`UNKNOWN app-framework MODE='${mode}'`);
  }
  return composed_rclass;
}
