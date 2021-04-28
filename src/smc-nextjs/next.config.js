const basePath = require("./lib/basePath")();

module.exports = {
  basePath,
  env: {
    basePath,
  },
  pageExtensions: ["jsx", "js", "ts", "tsx"],
};
