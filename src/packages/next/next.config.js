// next.js defines / to be an invalid basepath, whereas in cocalc it is valid:
const BASE_PATH = process.env.BASE_PATH ?? "/";

// next.js definition:
const basePath = BASE_PATH == "/" ? "" : BASE_PATH;

const { join, resolve } = require("path");

// Important!  We include basePath in tmp dir because if you build with a different
// basePath, then the cache may "corrupt everything".
const cacheDirectory = join(
  `/tmp/nextjs-${require("os").userInfo().username}`,
  basePath
);

module.exports = {
  basePath,
  //swcMinify: true, // would enable 7x faster RUST-based minifier -- however this crashes for us (https://github.com/vercel/next.js/discussions/30237#discussioncomment-1542842)
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
    // Webpack breaks without this pg-native alias, even though it's dead code,
    // due to how the pg module does package detection internally.
    config.resolve.alias["pg-native"] = ".";
    // These aliases are so we don't end up with two distinct copies
    // of React in our application, since this doesn't work at all!
    config.resolve.alias["react"] = resolve(__dirname, "node_modules", "react");
    config.resolve.alias["react-dom"] = resolve(
      __dirname,
      "node_modules",
      "react-dom"
    );
    config.ignoreWarnings = [
      // This yargs warning is caused by node-zendesk in the @cocalc/backend package
      // being a generally bad citizen.  Things seem to work fine (we barely use the
      // zendesk api anyways).
      { module: /^\.\.\/backend\/node_modules\/yargs.*/ },
    ];

    // Important: return the modified config
    return config;
  },
  // This is because the debug module color support would otherwise log this warning constantly:
  // Module not found: ESM packages (supports-color) need to be imported. Use 'import' to reference the package instead. https://nextjs.org/docs/messages/import-esm-externals
  experimental: {
    esmExternals: "loose",
  },
  // For i18n, see https://nextjs.org/docs/advanced-features/i18n-routing
  // We are doing this at all since it improves our Lighthouse accessibility score.
  i18n: {
    locales: ["en-US"],
    defaultLocale: "en-US",
  },
};
