// next.js defines / to be an invalid basepath, whereas in cocalc it is valid:

const basePath =
  process.env.BASE_PATH == "/"
    ? ""
    : process.env.BASE_PATH
    ? process.env.BASE_PATH
    : "";

const { resolve } = require("path");

module.exports = {
  basePath,
  env: {
    BASE_PATH: basePath, // make visible to frontend code.
    CUSTOMIZE: process.env.CUSTOMIZE
      ? process.env.CUSTOMIZE
      : JSON.stringify({ siteName: "CoCalc" }),
  },
  reactStrictMode: true,
  eslint: {
    // Warning: Dangerously allow production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // We have to be VERY explicit about the order of module imports.
    // Otherwise, e.g,. importing antd in @cocalc/frontend results in importing
    // react from @cocalc/frontend, and we end up with two distinct copies
    // of react in our application.  This doesn't work at all.  By being
    // explicit as below, we completely eliminate that problem.  However,
    // we do may to add things here if we create new modules.
    config.resolve.modules = [
      __dirname,
      resolve(__dirname, "node_modules"),
      resolve(__dirname, "../frontend/node_modules"),
      resolve(__dirname, "../util/node_modules"),
    ];
    // Important: return the modified config
    return config;
  },
  typescript: {
    // Disable checking for typescript errors when making production build.
    // We do this because we check using tsc anyways, and also due to runtime
    // configuration right now the build is being updated when the server starts,
    // and that needs to be fast.  (TODO: This is temporary!)
    ignoreBuildErrors: true,
  },
};
