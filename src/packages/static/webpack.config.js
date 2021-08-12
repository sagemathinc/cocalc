/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
* Webpack configuration file

This webpack config file might look scary, but it only consists of a few moving parts.

The Entry Points:
  - load: showed immediately when you start loading the page
  - app: the main web application -- this is the entire application.

NOTE: we used to have css and polyfill entry point, but the webpack
author specifically says this is an old antipattern about 38 minutes
into his ReactConf 2017 talk.

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
const misc = require("@cocalc/util/misc");
const misc_node = require("@cocalc/util-node/misc_node");
const SMC_VERSION = require("@cocalc/util/smc-version").version;
const theme = require("@cocalc/util/theme");
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
const OUTPUT = process.env.COCALC_OUTPUT
  ? path.resolve(__dirname, process.env.COCALC_OUTPUT)
  : path.resolve(__dirname, "dist");
const NODE_ENV = process.env.NODE_ENV || "development";
const PRODMODE = NODE_ENV == "production";
const { MEASURE } = process.env;
const date = new Date();
const BUILD_DATE = date.toISOString();
const BUILD_TS = date.getTime();
const COCALC_NOCLEAN = !!process.env.COCALC_NOCLEAN;

// output build environment variables of webpack
console.log(`SMC_VERSION         = ${SMC_VERSION}`);
console.log(`COCALC_GIT_REVISION = ${COCALC_GIT_REVISION}`);
console.log(`NODE_ENV            = ${NODE_ENV}`);
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

require("./src/plugins/define-constants")(registerPlugin, {
  SMC_VERSION,
  COCALC_GIT_REVISION,
  BUILD_DATE,
  BUILD_TS,
  DEBUG: !PRODMODE,
  CDN_VERSIONS,
  "process.env": {}, // the util polyfill assumes this is defined.
});

if (MEASURE) {
  require("./src/plugins/measure")(registerPlugin);
}

// We always use disk cache now:
const useDiskCache = true;

// It's critical that the caching filesystem is VERY fast, but
// it is fine if the data is wiped, so use /tmp.
const cacheDirectory = "/tmp/webpack";

if (useDiskCache) {
  console.log(`\nUsing '${cacheDirectory}' as filesystem cache.\n`);
} else {
  console.log(`\nNOT using filesystem cache.\n`);
}

module.exports = {
  cache: useDiskCache
    ? {
        // This is supposed to cache the in-memory state to disk
        // so initial startup time is less.  Don't do this in
        // user home directory on cocalc, since it uses a LOT
        // of disk IO, which makes everything very slow.
        type: "filesystem",
        buildDependencies: {
          config: [__filename],
        },
        cacheDirectory,
      }
    : undefined,
  devtool: PRODMODE ? undefined : "eval-cheap-module-source-map",
  mode: PRODMODE ? "production" : "development",
  entry: {
    load: "./src/load.tsx",
    app: "./src/webapp-cocalc.js",
  },
  /* Why chunkhash below, rather than contenthash? This says contenthash is a special
     thing for css and other text files only (??):
        https://medium.com/@sahilkkrazy/hash-vs-chunkhash-vs-contenthash-e94d38a32208
  */
  output: {
    path: OUTPUT,
    filename: PRODMODE ? "[name]-[chunkhash].js" : "[id]-[chunkhash].js",
    chunkFilename: PRODMODE ? "[chunkhash].js" : "[id]-[chunkhash].js",
    hashFunction: "sha256",
  },
  module: {
    rules: require("./src/module-rules")(PRODMODE),
  },
  resolve: {
    alias: {
      // @cocalc/frontend  alias so we can write `require("@cocalc/frontend/...")`
      // anywhere in that library:
      "@cocalc/frontend": path.resolve(
        __dirname,
        "node_modules",
        "@cocalc/frontend"
      ),
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
      path.resolve(__dirname, "node_modules", "@cocalc/assets"),
      path.resolve(__dirname, "node_modules", "@cocalc/assets/node_modules"),
      path.resolve(__dirname, "node_modules", "@cocalc/util"),
      path.resolve(__dirname, "node_modules", "@cocalc/util/node_modules"),
      path.resolve(__dirname, "node_modules", "@cocalc/frontend"),
      path.resolve(__dirname, "node_modules", "@cocalc/frontend/node_modules"),
      path.resolve(__dirname, "node_modules", "@cocalc/cdn"),
      path.resolve(__dirname, "node_modules", "@cocalc/cdn/node_modules"),
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
