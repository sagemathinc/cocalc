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
