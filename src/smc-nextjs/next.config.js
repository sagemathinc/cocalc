const basePath = require("./lib/basePath")();

module.exports = {
  basePath,
  env: {
    basePath,
  },
  future: {
    webpack5: true,
  },
  pageExtensions: ["jsx", "js", "ts", "tsx"],
};
