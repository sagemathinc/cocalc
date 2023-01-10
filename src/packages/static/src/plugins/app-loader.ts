import HtmlWebpackPlugin from "html-webpack-plugin";

export default function appLoaderPlugin(
  registerPlugin,
  PRODMODE: boolean,
  title: string
) {
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
      chunks: ["load", "embed"],
    })
  );
}
