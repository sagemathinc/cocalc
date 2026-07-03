// next.js defines / to be an invalid basepath, whereas in cocalc it is valid:
const BASE_PATH = process.env.BASE_PATH ?? "/";

// next.js definition:
const basePath = BASE_PATH == "/" ? "" : BASE_PATH;

const { join, resolve } = require("path");

// Important!  We include resolve('.') and basePath to avoid
// any possibility of multiple cocalc installs or different base
// paths conflicting with each other and causing corruption.
const cacheDirectory = join(
  `/tmp/nextjs-${require("os").userInfo().username}`,
  basePath,
  resolve("."),
);

const config = {
  basePath,
  env: { BASE_PATH },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Opt-in filesystem cache for local dev builds (e.g. cocalc-hub.sh sets
    // NEXTJS_FS_CACHE=1). Production CI/Docker leaves the var unset, so this
    // never affects deployed builds.
    if (process.env.NEXTJS_FS_CACHE) {
      config.cache = {
        type: "filesystem",
        buildDependencies: { config: [__filename] },
        cacheDirectory,
      };
    }
    // Webpack breaks without this pg-native alias, even though it's dead code,
    // due to how the pg module does package detection internally.
    config.resolve.alias["pg-native"] = ".";
    // These aliases are so we don't end up with two distinct copies
    // of React in our application, since this doesn't work at all!
    config.resolve.alias["react"] = resolve(__dirname, "node_modules", "react");
    config.resolve.alias["react-dom"] = resolve(
      __dirname,
      "node_modules",
      "react-dom",
    );
    config.devServer = {
      hot: true,
    };
    // Keep minification, but do NOT mangle class/function names. The minifier
    // otherwise renames classes (e.g. `Long` -> `n`), which breaks libraries
    // that identify types by `constructor.name`. Concretely: google-gax's
    // proto3-json-serializer detects a protobuf `Long` via
    // `value.constructor.name === 'Long'`; once mangled the check fails and
    // serializing any int64 field (e.g. a compute server's diskSizeGb) throws
    //   "toProto3JSON: don't know how to convert value 30".
    // This surfaced in the Rspack-bundled hub-next runtime (the compute server
    // "start" action runs in-process there), but the same class of bug can bite
    // browser code too, so we preserve names in both the client and server
    // bundles while still stripping whitespace / mangling locals for size.
    for (const plugin of config.optimization?.minimizer ?? []) {
      if (plugin?.constructor?.name === "SwcJsMinimizerRspackPlugin") {
        const args = (plugin._args ??= [{}]);
        const opts = (args[0] ??= {});
        const min = (opts.minimizerOptions ??= {});
        const mangle = (min.mangle ??= {});
        mangle.keep_classnames = true;
        mangle.keep_fnames = true;
      }
    }
    // The server bundle isn't size-sensitive and it runs the compute-server ->
    // GCP code that depends on the above (the "start" action executes in-process
    // in hub-next). Disable its minification entirely as a robust backstop via
    // the standard webpack option -- independent of the minifier-plugin internals
    // the loop above pokes at -- so a future next-rspack change can't silently
    // reintroduce the mangled-`Long` bug on the server.
    if (isServer) {
      config.optimization = config.optimization ?? {};
      config.optimization.minimize = false;
    }
    // Important: return the modified config
    return config;
  },
  // For i18n, see https://nextjs.org/docs/advanced-features/i18n-routing
  // We are doing this at all since it improves our Lighthouse accessibility score.
  i18n: {
    locales: ["en-US"],
    defaultLocale: "en-US",
  },
  poweredByHeader: false,
};

const withRspack = require("next-rspack");
// use NO_RSPACK to build without RSPACK.  This is useful on a machine with a lot
// of RAM (and patience) since it supports hot module reloading (so you don't have
// to refresh after making changes).

if (process.env.NO_RSPACK) {
  module.exports = config;
} else {
  module.exports = withRspack(config);
}
