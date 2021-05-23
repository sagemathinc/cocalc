/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
* Webpack configuration file

This webpack config file might look scary, but it only consists of a few moving parts.

The Entry Points:
  - load: showed immediately when you start loading the page
  - css: all the css is bundled and loaded from here
  - fill: polyfills
  - app: the main web application -- this is the entire application.
  - pdf.worker: pdfjs does work in a separate webworker thread.

There might also be chunks ([number]-hash.js) that are
loaded later on demand (read up on `require.ensure`).

The remaining configuration deals with setting up variables and
registering plugins.

Development vs. Production: There are two modes, which are documented at the
webpack website.  Differences include:
  - Production:
    - additional compression is enabled
    - all output filenames, except for the essential .html files,
      do have hashes and a rather flat hierarchy.
  - Development:
    - File names have no hashes, or hashes are deterministically based on the content.
      This means, when running webpack-watch, you do not end up with a growing pile of
      thousands of files in the output directory.
*/

"use strict";

const webpack = require("webpack");
const path = require("path");
const child_process = require("child_process");
const misc = require("smc-util/misc");
const misc_node = require("smc-util-node/misc_node");
const SMC_VERSION = require("smc-util/smc-version").version;
const theme = require("smc-util/theme");
const CDN_VERSIONS = require("@cocalc/cdn").versions;

// Determine the git revision hash:
const COCALC_GIT_REVISION = child_process
  .execSync("git rev-parse HEAD")
  .toString()
  .trim();
const TITLE = theme.SITE_NAME;
const DESCRIPTION = theme.APP_TAGLINE;
const COCALC_GITHUB_REPO = "https://github.com/sagemathinc/cocalc";
const COCALC_LICENSE = "custom";
const OUTPUT = path.resolve(__dirname, "dist");
const NODE_ENV = process.env.NODE_ENV || "development";
const PRODMODE = NODE_ENV == "production";
const { MEASURE } = process.env;
const date = new Date();
const BUILD_DATE = date.toISOString();
const BUILD_TS = date.getTime();
const COCALC_NOCLEAN = !!process.env.COCALC_NOCLEAN;

// The regexp removes the trailing slash, if there is one.
const BASE_URL = (process.env.COCALC_BASE_URL
  ? process.env.COCALC_BASE_URL
  : misc_node.BASE_URL
).replace(/\/$/, "");

// output build environment variables of webpack
console.log(`SMC_VERSION         = ${SMC_VERSION}`);
console.log(`COCALC_GIT_REVISION = ${COCALC_GIT_REVISION}`);
console.log(`NODE_ENV            = ${NODE_ENV}`);
console.log(`BASE_URL            = ${BASE_URL}`);
console.log(`MEASURE             = ${MEASURE}`);
console.log(`OUTPUT              = ${OUTPUT}`);
console.log(`COCALC_NOCLEAN      = ${COCALC_NOCLEAN}`);

const plugins = [];
function registerPlugin(desc, plugin, disable) {
  if (disable) {
    console.log("Disabling plugin:  ", desc);
  } else {
    console.log("Registering plugin:", desc);
    plugins.push(plugin);
  }
}

require("./src/plugins/banner")(registerPlugin, {
  TITLE,
  BUILD_DATE,
  COCALC_GIT_REVISION,
  SMC_VERSION,
  COCALC_GITHUB_REPO,
  COCALC_LICENSE,
});

if (!COCALC_NOCLEAN) {
  require("./src/plugins/clean")(registerPlugin, OUTPUT);
}

require("./src/plugins/app-loader")(registerPlugin, PRODMODE, TITLE);

const MATHJAX_URL = `${BASE_URL}/cdn/mathjax-${CDN_VERSIONS.mathjax}/MathJax.js`;

require("./src/plugins/define-constants")(registerPlugin, {
  MATHJAX_URL,
  SMC_VERSION,
  COCALC_GIT_REVISION,
  BUILD_DATE,
  BUILD_TS,
  DEBUG: !PRODMODE,
  BASE_URL,
  CDN_VERSIONS,
  "process.env": {}, // the util polyfill assumes this is defined.
});

if (!PRODMODE) {
  console.log(`\n*************************************************************************************\n
    https://cocalc.com${BASE_URL}/app
\n*************************************************************************************\n`);
}

if (MEASURE) {
  require("./src/plugins/measure")(registerPlugin);
}

module.exports = {
  cache: true,
  // eval is considered optimal for source maps according to
  // https://webpack.js.org/configuration/devtool/
  devtool: PRODMODE ? undefined : "eval",
  mode: PRODMODE ? "production" : "development",
  entry: {
    load: "./src/load.tsx",
    css: "./src/webapp-css.js",
    fill: "@babel/polyfill",
    app: "./src/webapp-cocalc.js",
    "pdf.worker":
      "./node_modules/smc-webapp/node_modules/pdfjs-dist/build/pdf.worker.entry",
  },
  output: {
    path: OUTPUT,
    // publicPath is encoded in the static files; they reference it when grabbing more content from server
    publicPath: path.join(BASE_URL, "static") + "/",
    filename: PRODMODE ? "[name]-[hash].cacheme.js" : "[name].nocache.js",
    chunkFilename: PRODMODE ? "[id]-[hash].cacheme.js" : "[id].nocache.js",
    hashFunction: "sha256",
  },
  module: {
    rules: require("./src/module-rules")(PRODMODE),
  },
  resolve: {
    alias: {
      // smc-webapp alias so we can write `require("smc-webapp/...")`
      // anywhere in that library:
      "smc-webapp": path.resolve(__dirname, "node_modules", "smc-webapp"),
      // This entities/maps alias is needed due to a weird markdown-it import
      // that webpack 5 won't resolve:
      "entities/maps": path.resolve(
        __dirname,
        "node_modules/entities/lib/maps"
      ),
    },
    // So we can require('file') instead of require('file.tsx'):
    extensions: [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".json",
      ".coffee",
      ".cjsx",
      ".scss",
      ".sass",
    ],
    symlinks: true,
    modules: [
      __dirname,
      path.resolve(__dirname, "node_modules"),
      path.resolve(__dirname, "node_modules", "webapp-lib"),
      path.resolve(__dirname, "node_modules", "webapp-lib/node_modules"),
      path.resolve(__dirname, "node_modules", "smc-util"),
      path.resolve(__dirname, "node_modules", "smc-util/node_modules"),
      path.resolve(__dirname, "node_modules", "smc-webapp"),
      path.resolve(__dirname, "node_modules", "smc-webapp/node_modules"),
    ],
    preferRelative: false /* do not use true: it may workaround some weird cases, but breaks many things (e.g., slate) */,
    fallback: {
      stream: require.resolve("stream-browserify"),
      util: require.resolve("util/"),
      path: require.resolve("path-browserify"),
      crypto: require.resolve("crypto-browserify") /* for @phosphor/widgets */,
      assert: require.resolve("assert/"),
    },
  },

  plugins,
};
