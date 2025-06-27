// next.js defines / to be an invalid basepath, whereas in cocalc it is valid:
const BASE_PATH = process.env.BASE_PATH ?? "/";

// next.js definition:
const basePath = BASE_PATH == "/" ? "" : BASE_PATH;

const { join, resolve } = require("path");
const withRspack = require("next-rspack");

// Important!  We include resolve('.') and basePath to avoid
// any possibility of multiple cocalc installs or different base
// paths conflicting with each other and causing corruption.
const cacheDirectory = join(
  `/tmp/nextjs-${require("os").userInfo().username}`,
  basePath,
  resolve("."),
);

const removeImports = require("next-remove-imports")();

module.exports = withRspack(
  removeImports({
    basePath,
    swcMinify: true, //  enable faster RUST-based minifier
    env: { BASE_PATH },
    reactStrictMode: false, // See https://github.com/ant-design/ant-design/issues/26136
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
      config.resolve.alias["react"] = resolve(
        __dirname,
        "node_modules",
        "react",
      );
      config.resolve.alias["react-dom"] = resolve(
        __dirname,
        "node_modules",
        "react-dom",
      );
      config.ignoreWarnings = [
        // This yargs warning is caused by node-zendesk in the @cocalc/server package
        // being a generally bad citizen.  Things seem to work fine (we barely use the
        // zendesk api anyways).
        { module: /^\.\.\/server\/node_modules\/yargs.*/ },
      ];

      // Important: return the modified config
      return config;
    },
    experimental: {
      // This is because the debug module color support would otherwise log this warning constantly:
      // Module not found: ESM packages (supports-color) need to be imported. Use 'import' to
      // reference the package instead. https://nextjs.org/docs/messages/import-esm-externals
      // esmExternals: "loose", // not supported by turbopack
      // We raise largePageDataBytes since this was recently added, and breaks a lot of SSR rendering
      // for cocalc share server.  By default this is 128 * 1000 = "128KB", and we are changing it to
      // 128 * 1000 * 15 = "1MB" for now.  TODO: Obviously, it would be nice to fix the root causes of this
      // being too big, but that's for another day, since our production website is broken right now.
      largePageDataBytes: 128 * 1000 * 10,
      // If you click the back button in the browser, it should go back to the previous page and restore the scroll position.
      // With Next.js in the loop, this doesn't happen by default.
      // besides the ticket about this, here is a blogpost about this
      // https://www.joshwcomeau.com/react/nextjs-scroll-restoration/
      scrollRestoration: true,
      // https://nextjs.org/docs/app/building-your-application/optimizing/memory-usage#webpack-build-worker
      webpackBuildWorker: true,
    },
    // For i18n, see https://nextjs.org/docs/advanced-features/i18n-routing
    // We are doing this at all since it improves our Lighthouse accessibility score.
    i18n: {
      locales: ["en-US"],
      defaultLocale: "en-US",
    },
    poweredByHeader: false, // https://github.com/sagemathinc/cocalc/issues/6101
  }),
);
