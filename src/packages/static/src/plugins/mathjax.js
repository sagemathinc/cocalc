const async = require("async");
const fs = require("fs");
const path = require("path");

const misc_node = require("smc-util-node/misc_node");

const { MATHJAX_URL } = misc_node; // from where the files are served
const { MATHJAX_ROOT } = misc_node; // where the symlink originates
const { MATHJAX_LIB } = misc_node; // where the symlink points to
console.log(`MATHJAX_URL         = ${MATHJAX_URL}`);
console.log(`MATHJAX_ROOT        = ${MATHJAX_ROOT}`);
console.log(`MATHJAX_LIB         = ${MATHJAX_LIB}`);
class MathjaxVersionedSymlink {
  apply(compiler) {
    // make absolute path to the mathjax lib (lives in node_module
    // of smc-webapp)
    const symto = path.resolve(__dirname, `${MATHJAX_LIB}`);
    console.log(`mathjax symlink: pointing to ${symto}`);
    const mksymlink = (dir, cb) =>
      fs.access(dir, function (err) {
        if (err) {
          fs.symlink(symto, dir, cb);
        }
      });
    const done = (compilation) =>
      async.concat([MATHJAX_ROOT, misc_node.MATHJAX_NOVERS], mksymlink);
    const plugin = { name: "MathjaxVersionedSymlink" };
    compiler.hooks.done.tap(plugin, done);
  }
}

module.exports = function (registerPlugin) {
  registerPlugin(
    "MathjaxVersionedSymlink -- creates mathjax symlinks",
    new MathjaxVersionedSymlink(),
    true
  );
  return MATHJAX_URL;
};
