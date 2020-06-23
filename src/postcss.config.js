/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const postcssConfig = {
  plugins: [require("autoprefixer")],
};

// If we are in production mode, then add cssnano
if (process.env.NODE_ENV === "production") {
  postcssConfig.plugins.push(
    require("cssnano")({
      // use the safe preset so that it doesn't
      // mutate or remove code from our css
      preset: "default",
    })
  );
}

module.exports = postcssConfig;
