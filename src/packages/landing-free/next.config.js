// This is the next.js definition of basePath.  next.js defines "/"
// to be an invalid basepath, whereas in cocalc it is valid:
const basePath =
  process.env.BASE_PATH == "/"
    ? ""
    : process.env.BASE_PATH
    ? process.env.BASE_PATH
    : "";

module.exports = {
  basePath,
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Webpack breaks without this pg-native alias, even though it's dead code,
    // due to how the pg module does package detection internally.
    config.resolve.alias["pg-native"] = ".";
    return config;
  },
};
