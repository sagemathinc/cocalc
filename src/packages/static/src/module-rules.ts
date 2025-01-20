/*
This module defines how webpack loads each type of file.


See https://github.com/iykekings/react-swc-loader-template for swc-loader configuration.
We use swc-loader as opposed to other options for consistency with next.js.

We do apply swc-loader to node_modules, since there are "bad" modules out there
(@jupyter-widgets/* I'm looking at you -- see https://github.com/sagemathinc/cocalc/issues/6128),
and weird surprises can pop up.  We have to exclude transpiling jquery since otherwise
we get an infinite recursion on startup, but of course jquery is fine.
*/

import { Configuration } from "@rspack/cli";

export default function moduleRules(
  devServer?: boolean,
): Configuration["module"] {
  return {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx|mjs|cjs)$/,
        // the swc-loader absolutely mangles some upstream libraries so they
        // are totally broken!  Examples include: jquery and react-virtuoso.
        // We could exclude just those two via "/.*node_modules\/(jquery.*|react-virtuoso.*)/",
        // but instead we just exclude *all* of node_modules, since any
        // random module or upgraded could get broken at any time and that
        // is very painful and confusing.
        exclude: /.*node_modules\/.*/,
        use: [
          {
            loader: "builtin:swc-loader",
            options: devServer
              ? {
                  jsc: {
                    transform: {
                      react: {
                        development: true,
                        refresh: true,
                      },
                    },
                  },
                }
              : undefined,
          },
        ],
      },
      { test: /\.coffee$/, loader: "coffee-loader" },
      {
        test: /\.cjsx$/,
        use: [{ loader: "coffee-loader" }, { loader: "cjsx-loader" }],
      },
      {
        test: /\.less$/,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              importLoaders: 2,
            },
          },
          {
            loader: "less-loader",
            options: { lessOptions: { javascriptEnabled: true } },
          }, // javascriptEnabled needed for antd.
        ],
      },
      {
        test: /\.scss$/i,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              importLoaders: 2,
            },
          },
          "sass-loader",
        ],
      },
      {
        test: /\.sass$/i,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              importLoaders: 2,
            },
          },
          "sass-loader",
        ],
      },
      {
        test: /\.png$/,
        type: "asset/resource",
      },
      {
        test: /\.ico$/,
        type: "asset/resource",
      },
      {
        test: /\.svg(\?[a-z0-9\.-=]+)?$/,
        type: "asset/resource",
      },
      {
        test: /\.(jpg|jpeg|gif)$/,
        type: "asset/resource",
      },
      {
        test: /\.html$/i,
        type: "asset/resource",
      },
      { test: /\.hbs$/, loader: "handlebars-loader" },
      {
        test: /\.svg?$/,
        type: "asset/resource",
      },
      {
        test: /\.woff(2)?(\?[a-z0-9\.-=]+)?$/,
        type: "asset/resource",
      },
      {
        test: /\.ttf(\?[a-z0-9\.-=]+)?$/,
        type: "asset/resource",
      },
      {
        test: /\.eot(\?[a-z0-9\.-=]+)?$/,
        type: "asset/resource",
      },
      {
        test: /\.css$/i,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              importLoaders: 1,
            },
          },
        ],
      },
      {
        // This rule makes source maps compatible with other cocalc included modules like @cocalc/util.  Without this, you
        // get lots of warnings in the console, and lots of source maps don't work at all.
        // https://stackoverflow.com/questions/61767538/devtools-failed-to-load-sourcemap-for-webpack-node-modules-js-map-http-e
        test: /\.(j|t)s$/,
        enforce: "pre" as "pre",
        use: ["source-map-loader"],
      },
      {
        resourceQuery: /raw/,
        type: "asset/source",
      },
      {
        test: /\.(glsl|txt)/,
        type: "asset/source",
      },
    ],
  } as const;
}
