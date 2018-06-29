/*
@j3 -- fix this.

   - transform is exported, but where is it used?
   - react_component is referenced but NOT used.  It's also NOT defined anywhere in our codebase.
   - same for smc, but I fixed that.


declare var smc;

let MODE = "default"; // one of 'default', 'count', 'verbose', 'time'
//MODE = 'verbose'  # print every CoCalc component that is rendered when rendered
//MODE = 'trace'     # print only components that take some time, along with timing info
//MODE = 'count'    # collect count of number of times each component is rendered; call get_render_count and reset_render_count to see.
//MODE = 'time'      # show every single component render and how long it took

// smc is a global variable in the frontend.

if (typeof smc === "undefined" || smc === null) {
  MODE = "default"; // never enable in prod
}

if (MODE !== "default") {
  console.log(`app-framework MODE='${MODE}'`);
}
export function transform(rclass: any) {
  switch (MODE) {
    case "count":
      // Use these in the console:
      //  reset_render_count()
      //  JSON.stringify(get_render_count())
      var render_count = {};
      rclass = function(x: any) {
        x._render = x.render;
        x.render = function() {
          render_count[x.displayName] =
            (render_count[x.displayName] != null
              ? render_count[x.displayName]
              : 0) + 1;
          return this._render();
        };
        return react_component(x);
      };
      (redux as any).get_render_count = function() {
        let total = 0;
        for (let k in render_count) {
          const v = render_count[k];
          total += v;
        }

        return { counts: render_count, total };
      };
      (redux as any).reset_render_count = function() {
        render_count = {};
      };
      break;
    case "time":
      rclass = x => {
        const t0 = performance.now();
        const r = react_component(x);
        const t1 = performance.now();
        if (t1 - t0 > 1) {
          console.log(r.displayName, "took", t1 - t0, "ms of time");
        }
        return r;
      };
      break;
    case "verbose":
      rclass = function(x: any) {
        x._render = x.render;
        x.render = function() {
          console.log(x.displayName);
          return this._render();
        };
        return react_component(x);
      };
      break;
    case "trace":
      var { react_debug_trace } = require("../app-framework-debug");
      rclass = react_debug_trace(react_component);
      break;
    case "default":
      rclass = react_component;
      break;
    default:
      throw Error(`UNKNOWN app-framework MODE='${MODE}'`);
  }
  return rclass;
}

*/