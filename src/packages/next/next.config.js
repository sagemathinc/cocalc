// next.js defines / to be an invalid basepath, whereas in cocalc it is valid:
const BASE_PATH = process.env.BASE_PATH ?? "/";

// next.js definition:
const basePath = BASE_PATH == "/" ? "" : BASE_PATH;

const { resolve } = require("path");

const cacheDirectory = `/tmp/nextjs-${require("os").userInfo().username}`;

module.exports = {
  basePath,
  env: { BASE_PATH },
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // typescript: { ignoreBuildErrors: true },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.cache = {
      type: "filesystem",
      buildDependencies: {
        config: [__filename],
      },
      cacheDirectory,
    };
    // We have to be VERY explicit about the order of module imports.
    // Otherwise, e.g,. importing antd in @cocalc/frontend results in importing
    // react from @cocalc/frontend, and we end up with two distinct copies
    // of React in our application.  This doesn't work at all!  By being
    // explicit as below, we completely eliminate that problem.  However,
    // we do may to add things here if we create new modules.
    config.resolve.modules = [
      __dirname,
      resolve(__dirname, "node_modules"),
      resolve(__dirname, "../frontend/node_modules"),
      resolve(__dirname, "../util/node_modules"),
    ];
    // Webpack breaks without this pg-native alias, even though it's dead code,
    // due to how the pg module does package detection internally.
    config.resolve.alias["pg-native"] = ".";
    // Important: return the modified config
    return config;
  },
};
