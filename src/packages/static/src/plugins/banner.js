/*
Adds a banner to each compiled and minified source .js file.
*/

const webpack = require("webpack");
const DASHES = "--------------------------";

module.exports = function (registerPlugin, params) {
  const banner = `\
This file is part of ${params.TITLE}.  It was compiled ${params.BUILD_DATE} at revision
${params.COCALC_GIT_REVISION} and version ${params.SMC_VERSION}.
See ${params.COCALC_GITHUB_REPO} for its ${params.COCALC_LICENSE} licensed code.\
`;
  console.log(`\n${DASHES}\n${banner}\n${DASHES}\n`);

  registerPlugin(
    "BannerPlugin -- adds banner to each compiled source .js file",
    new webpack.BannerPlugin({
      banner,
      entryOnly: true,
    })
  );
};
