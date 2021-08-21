// next.js defines / to be an invalid basepath, whereas in cocalc it is valid:

const basePath =
  process.env.BASE_PATH == "/"
    ? ""
    : process.env.BASE_PATH
    ? process.env.BASE_PATH
    : "";

module.exports = {
  basePath,
  env: {
    BASE_PATH: basePath, // make visible to frontend code.
  },
  reactStrictMode: true,
  eslint: {
    // Warning: Dangerously allow production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Disable checking for typescript errors when making production build.
    // We do this because we check using tsc anyways, and also due to runtime
    // configuration right now the build is being updated when the server starts,
    // and that needs to be fast.  (TODO: This is temporary!)
    ignoreBuildErrors: true,
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.resolve.alias["pg-native"] = "."; // webpack breaks without this, even though it's dead code.
    // Important: return the modified config
    return config;
  },
};
