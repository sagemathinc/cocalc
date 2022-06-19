const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = function (registerPlugin, PRODMODE, title) {
  registerPlugin(
    "HTML -- generates the app.html file",
    new HtmlWebpackPlugin({
      title,
      filename: "app.html",
      template: "src/app.html",
      hash: PRODMODE,
      chunks: ["load", "app"],
    })
  );

  registerPlugin(
    "HTML -- generates the embed.html file",
    new HtmlWebpackPlugin({
      title,
      filename: "embed.html",
      template: "src/app.html",
      hash: PRODMODE,
      chunks: ["embed"],
    })
  );
};
