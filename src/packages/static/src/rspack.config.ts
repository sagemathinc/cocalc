/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
* Webpack configuration file

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

import { Configuration } from "@rspack/cli";
import type { WebpackPluginInstance } from "@rspack/core";
import { ProvidePlugin } from "@rspack/core";
import { execSync } from "child_process";
import { resolve as path_resolve } from "path";

import getLogger from "@cocalc/backend/logger";
import { versions as CDN_VERSIONS } from "@cocalc/cdn";
import { version as SMC_VERSION } from "@cocalc/util/smc-version";
import { SITE_NAME as TITLE } from "@cocalc/util/theme";
import moduleRules from "./module-rules";
import appLoaderPlugin from "./plugins/app-loader";
import bannerPlugin from "./plugins/banner";
import cleanPlugin from "./plugins/clean";
import defineConstantsPlugin from "./plugins/define-constants";
import hotModuleReplacementPlugin, { getHotMiddlewareUrl } from "./plugins/hot";

const logger = getLogger("rspack.config");

// Resolve a path to an absolute path, where the input pathRelativeToTop is
// relative to "src/packages/static".
function resolve(...args): string {
  return path_resolve(__dirname, "..", "..", ...args);
}

interface Options {
  middleware?: boolean;
}

// NOTE: the JSDoc below is necessary, because otherwise the import in rspack.config.js causes
// TS2742: The inferred type of 'getConfig' cannot be named without a reference to
// '.pnpm/@rspack+binding@1.1.1/node_modules/@rspack/binding'.
// This is likely not portable. A type annotation is necessary.

/**
 * Gets the configuration for RSPack.
 *
 * @param {Object} [options={}] - The options for configuring RSPack.
 * @param {boolean} [options.middleware] - Indicates whether to enable middleware.
 * @returns {Configuration} The RSPack configuration object.
 */
export default function getConfig({ middleware }: Options = {}): Configuration {
  // Determine the git revision hash:
  const COCALC_GIT_REVISION = execSync("git rev-parse HEAD").toString().trim();
  const COCALC_GITHUB_REPO = "https://github.com/sagemathinc/cocalc";
  const COCALC_LICENSE = "custom";
  const OUTPUT = process.env.COCALC_OUTPUT
    ? resolve(process.env.COCALC_OUTPUT)
    : resolve("dist");
  const NODE_ENV = process.env.NODE_ENV || "development";
  const PRODMODE = NODE_ENV == "production";
  const { MEASURE } = process.env;
  const date = new Date();
  const BUILD_DATE = date.toISOString();
  const BUILD_TS = date.getTime();
  const COCALC_NOCLEAN = !!process.env.COCALC_NOCLEAN;
  const RSPACK_DEV_SERVER =
    NODE_ENV != "production" && !process.env.NO_RSPACK_DEV_SERVER;

  // output build variables
  console.log(`SMC_VERSION         = ${SMC_VERSION}`);
  console.log(`COCALC_GIT_REVISION = ${COCALC_GIT_REVISION}`);
  console.log(`NODE_ENV            = ${NODE_ENV}`);
  console.log(`MEASURE             = ${MEASURE}`);
  console.log(`OUTPUT              = ${OUTPUT}`);
  console.log(`COCALC_NOCLEAN      = ${COCALC_NOCLEAN}`);
  console.log(`RSPACK_DEV_SERVER   = ${RSPACK_DEV_SERVER}`);

  const plugins: WebpackPluginInstance[] = [];
  function registerPlugin(
    desc: string,
    plugin: WebpackPluginInstance,
    disable?: boolean,
  ) {
    if (disable) {
      console.log("Disabling plugin:  ", desc);
    } else {
      console.log("Registering plugin:", desc);
      plugins.push(plugin);
    }
  }

  bannerPlugin(registerPlugin, {
    TITLE,
    BUILD_DATE,
    COCALC_GIT_REVISION,
    SMC_VERSION,
    COCALC_GITHUB_REPO,
    COCALC_LICENSE,
  });

  if (!middleware && !COCALC_NOCLEAN) {
    cleanPlugin(registerPlugin, OUTPUT);
  }

  appLoaderPlugin(registerPlugin, PRODMODE, TITLE);

  defineConstantsPlugin(registerPlugin, {
    SMC_VERSION,
    COCALC_GIT_REVISION,
    BUILD_DATE,
    BUILD_TS,
    DEBUG: !PRODMODE,
    CDN_VERSIONS,
    "process.env": {}, // the util polyfill assumes this is defined.
  });

  registerPlugin(
    "define React",
    new ProvidePlugin({
      React: "react",
    }),
  );

  if (MEASURE) {
    // see https://rspack.dev/guide/optimization/analysis
    throw Error("measure: not implemented");
  }

  if (RSPACK_DEV_SERVER) {
    hotModuleReplacementPlugin(registerPlugin);
  }

  function insertHotMiddlewareUrl(v: string[]): string[] {
    const hotMiddlewareUrl = getHotMiddlewareUrl();
    if (RSPACK_DEV_SERVER) {
      v.unshift(hotMiddlewareUrl);
    }
    return v;
  }

  const config: Configuration = {
    // this makes things 10x slower:
    //cache: RSPACK_DEV_SERVER || PRODMODE ? false : true,
    ignoreWarnings: [/Failed to parse source map/],
    devtool: PRODMODE ? undefined : "eval-cheap-module-source-map",
    mode: PRODMODE
      ? ("production" as "production")
      : ("development" as "development"),
    entry: {
      load: insertHotMiddlewareUrl([resolve("dist-ts/src/load.js")]),
      app: {
        import: insertHotMiddlewareUrl([
          resolve("dist-ts/src/webapp-cocalc.js"),
        ]),
        dependOn: "load",
      },
      embed: {
        import: insertHotMiddlewareUrl([
          resolve("dist-ts/src/webapp-embed.js"),
        ]),
        dependOn: "load",
      },
    },
    /* Why chunkhash below, rather than contenthash? This says contenthash is a special
     thing for css and other text files only (??):
        https://medium.com/@sahilkkrazy/hash-vs-chunkhash-vs-contenthash-e94d38a32208
  */
    output: {
      path: OUTPUT,
      filename: PRODMODE ? "[name]-[chunkhash].js" : "[id]-[chunkhash].js",
      chunkFilename: PRODMODE ? "[chunkhash].js" : "[id]-[chunkhash].js",
    },
    module: moduleRules(RSPACK_DEV_SERVER),
    resolve: {
      alias: {
        // @cocalc/frontend  alias so we can write `import "@cocalc/frontend/..."`
        // anywhere in that library:
        "@cocalc/frontend": resolve("node_modules", "@cocalc/frontend"),
        // This entities/maps alias is needed due to a weird markdown-it import
        // that webpack5 won't resolve:
        "entities/maps": resolve("node_modules/entities/lib/maps"),
      },
      // So we can "import 'file'" instead of "import 'file.tsx'"
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
      modules: ["node_modules"],
      fallback: {
        stream: require.resolve("stream-browserify"),
        path: require.resolve("path-browserify"),
        util: require.resolve("util/"),
        assert: require.resolve("assert/"),
      },
    },
    resolveLoader: {
      modules: [resolve("node_modules")],
    },
    plugins,
    devServer: {
      hot: true,
    },
  };

  logger.debug(config);
  return config;
}
