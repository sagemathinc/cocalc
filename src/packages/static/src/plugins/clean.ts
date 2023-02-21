/*
Cleanup dist files before each build; otherwise, compiles create
an evergrowing pile of files.  This is important for the production
builds.

This is also safer than `rm -rf dist`.
*/

import { CleanWebpackPlugin } from "clean-webpack-plugin";

export default function cleanPlugin(registerPlugin, OUTPUT) {
  registerPlugin(
    "CleanWebpackPlugin -- cleanup generated dist directory to save space",
    new CleanWebpackPlugin({
      cleanOnceBeforeBuildPatterns: [OUTPUT],
      verbose: true,
      dry: false,
    })
  );
}
