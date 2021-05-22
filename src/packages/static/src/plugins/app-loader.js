const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = function (registerPlugin, PRODMODE, title) {
  registerPlugin(
    "HTML -- generates the app.html file",
    new HtmlWebpackPlugin({
      title,
      filename: "app.html",
      template: "src/app.html",
      hash: PRODMODE,
    })
  );
};

// This is related to showing loading progress for each chunk as it is loaded.
// However, I'm not re-implementing this, because I'm concerned about impacts
// on performance and adding unnecessary complication.  It's much better to
// spend time making cocalc load much more quickly by dramatically reducing
// the chunk sizes...
/*
function getChunks(assets) {
  // I have no clue how to get the file sizes or if it is even possible anymore.
  // So since this is only used for some graphical display, I'm copying these
  // from a recent version...
  let FAKE_SIZES = {};
  if (PRODMODE) {
    // TODO: need production versions too.
    FAKE_SIZES = {
      css: 1715895,
      fill: 90089,
      "pdf.worker": 670368,
      smc: 15954895,
      vendor: 32598,
    };
  } else {
    FAKE_SIZES = {
      css: 1913616,
      fill: 224966,
      "pdf.worker": 1712753,
      smc: 28187583,
      vendor: 47171,
    };
  }
  // chunks : { [key: string]: { size: number; entry: string; hash: string } }
  const chunks = {};
  for (const entry of assets.js) {
    const i = entry.lastIndexOf("/");
    const j = entry.lastIndexOf(".nocache.js");
    const s = entry.slice(i + 1, j);
    const k = s.indexOf("-");
    let name,
      hash = "";
    if (k == -1) {
      name = s;
    } else {
      name = s.slice(0, k);
      hash = s.slice(k + 1);
    }
    chunks[name] = {
      size: FAKE_SIZES[name] ? FAKE_SIZES[name] : 2000000,
      entry,
      hash,
    };
  }
  return { chunks };
}
*/
