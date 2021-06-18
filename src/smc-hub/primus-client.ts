/* add endpoint that serves the primus client js code. */

const UglifyJS = require("uglify-js");

export default function setupPrimusClient(router, primus): void {
  const primus_js = primus.library();
  const primus_min_js: string = UglifyJS.minify(primus_js).code;
  router.get("/primus.js", (_, res) => {
    res.header("Content-Type", "text/javascript");
    res.header("Cache-Control", `private, max-age=${60 * 60}`);
    res.send(primus_js);
  });
  router.get("/primus.min.js", (_, res) => {
    res.header("Content-Type", "text/javascript");
    res.header("Cache-Control", `private, max-age=${60 * 60}`);
    res.send(primus_min_js);
  });
}
