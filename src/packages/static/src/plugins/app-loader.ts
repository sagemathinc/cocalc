import rspack from "@rspack/core";
import { resolve } from "path";

export default function appLoaderPlugin(
  registerPlugin,
  PRODMODE: boolean,
  title: string,
) {
  registerPlugin(
    "HTML -- generates the app.html file",
    new rspack.HtmlRspackPlugin({
      title,
      filename: "app.html",
      template: resolve(__dirname, "../app.html"),
      hash: PRODMODE,
      chunks: ["load", "app"],
    }),
  );

  registerPlugin(
    "HTML -- generates the embed.html file",
    new rspack.HtmlRspackPlugin({
      title,
      filename: "embed.html",
      template: resolve(__dirname, "../app.html"),
      hash: PRODMODE,
      chunks: ["load", "embed"],
    }),
  );

  registerPlugin(
    "HTML -- generates the share.html file",
    new rspack.HtmlRspackPlugin({
      title,
      filename: "share.html",
      template: resolve(__dirname, "../app.html"),
      hash: PRODMODE,
      chunks: ["load", "share-viewer"],
    }),
  );
}
