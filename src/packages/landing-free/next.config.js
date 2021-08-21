// next.js defines / to be an invalid basepath, whereas in cocalc it is valid:

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
    config.resolve.alias["pg-native"] = "."; // webpack breaks without this, even though it's dead code.
    return config;
  },
};
