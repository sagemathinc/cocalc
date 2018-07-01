declare var smc, performance;

export enum MODES {
  count = "count", // collect count of number of times each component is rendered; call get_render_count and reset_render_count to see.
  time = "time", // show every single component render and how long it took
  verbose = "verbose", // print every CoCalc component that is rendered when rendered
  trace = "trace", // print only components that take some time, along with timing info
  default = "default" // Do nothing extra
}

export function debug_transform(rclass: any, mode = MODES.default) {
  if (typeof smc === "undefined" || smc === null) {
    return rclass // do not enable debugging in prod
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
      var render_count = {};
      composed_rclass = function(x: any) {
        x._render = x.render;
        x.render = function() {
          render_count[x.displayName] =
            (render_count[x.displayName] != null
              ? render_count[x.displayName]
              : 0) + 1;
          return this._render();
        };
        return rclass(x);
      };
      smc.get_render_count = function() {
        let total = 0;
        for (let k in render_count) {
          const v = render_count[k];
          total += v;
        }

        return { counts: render_count, total };
      };
      smc.reset_render_count = function() {
        render_count = {};
      };
      break;
    case "time":
      composed_rclass = x => {
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
      composed_rclass = function(x: any) {
        x._render = x.render;
        x.render = function() {
          console.log(x.displayName);
          return this._render();
        };
        return rclass(x);
      };
      break;
    case "trace":
      var { react_debug_trace } = require("../app-framework-debug");
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
