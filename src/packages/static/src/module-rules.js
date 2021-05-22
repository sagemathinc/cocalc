/*
This module defines how webpack loads each type of file.
*/

module.exports = function (PRODMODE) {
  // tuning generated filenames and the configs for the aux files loader.
  const hashname = PRODMODE
    ? "[sha256:hash:base62:33].cacheme.[ext]" // don't use base64, it's not recommended for some reason.
    : "[path][name].nocache.[ext]";

  return [
    { test: /\.coffee$/, loader: "coffee-loader" },
    {
      test: /\.cjsx$/,
      use: [{ loader: "coffee-loader" }, { loader: "cjsx-loader" }],
    },
    { test: [/node_modules\/prom-client\/.*\.js$/], loader: "babel-loader" },
    { test: [/latex-editor\/.*\.jsx?$/], loader: "babel-loader" },
    { test: [/build\/pdf.js$/], loader: "babel-loader" }, // since they messed up their release including Optional Chaining in built files!
    {
      test: /\.tsx?$/,
      use: {
        loader: "ts-loader",
        options: { transpileOnly: true },
        // NOTE: We must disable typescript checking, since it is way too slow and uses
        // too much RAM.  Instead you must use `tsc --watch` directly in another shell,
        // or an IDE that supports typescript.
      },
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
        "postcss-loader",
        "less-loader",
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
        "postcss-loader",
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
        "postcss-loader",
        "sass-loader",
      ],
    },
    {
      test: /\.png$/,
      use: [
        {
          loader: "file-loader",
          options: { name: hashname, limit: 16000, mimetype: "image/png" },
        },
      ],
    },
    {
      test: /\.ico$/,
      use: [
        {
          loader: "file-loader",
          options: { name: hashname, mimetype: "image/x-icon" },
        },
      ],
    },
    {
      test: /\.svg(\?[a-z0-9\.-=]+)?$/,
      use: [
        {
          loader: "url-loader",
          options: {
            name: hashname,
            limit: 16000,
            mimetype: "image/svg+xml",
          },
        },
      ],
    },
    {
      test: /\.(jpg|jpeg|gif)$/,
      use: [{ loader: "file-loader", options: { name: hashname } }],
    },
    {
      test: /\.html$/,
      use: [
        { loader: "raw-loader" },
        {
          loader: "html-minify-loader",
          options: { conservativeCollapse: true },
        },
      ],
    },
    {
      test: /\.txt$/,
      use: [{ loader: "raw-loader" }],
    },
    { test: /\.hbs$/, loader: "handlebars-loader" },
    {
      test: /\.woff(2)?(\?[a-z0-9\.-=]+)?$/,
      use: [
        {
          loader: "url-loader",
          options: { name: hashname, mimetype: "application/font-woff" },
        },
      ],
    },
    {
      test: /\.ttf(\?[a-z0-9\.-=]+)?$/,
      use: [
        {
          loader: "url-loader",
          options: { limit: 10000, mimetype: "application/octet-stream" },
        },
      ],
    },
    {
      test: /\.eot(\?[a-z0-9\.-=]+)?$/,
      use: [{ loader: "file-loader", options: { name: hashname } }],
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
        "postcss-loader",
      ],
    },
    { test: /\.pug$/, loader: "pug-loader" },
    {
      // This rule makes source maps compatible with other cocalc included modules like smc-util.  Without this, you
      // get lots of warnings in the console, and lots of source maps don't work at all.
      // https://stackoverflow.com/questions/61767538/devtools-failed-to-load-sourcemap-for-webpack-node-modules-js-map-http-e
      test: /\.(j|t)s$/,
      enforce: "pre",
      use: ["source-map-loader"],
    },
  ];
};
