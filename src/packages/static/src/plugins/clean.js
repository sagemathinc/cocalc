/*
Cleanup dist files before each build; otherwise, compiles create
an evergrowing pile of files.  This is important for the production
builds.

This is also safer than `rm -rf dist`.
*/

const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = function (registerPlugin, OUTPUT) {
  registerPlugin(
    "CleanWebpackPlugin -- cleanup generated dist directory to save space",
    new CleanWebpackPlugin({
      cleanOnceBeforeBuildPatterns: [OUTPUT],
      verbose: true,
      dry: false,
    })
  );
};
