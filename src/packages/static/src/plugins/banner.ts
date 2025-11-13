/*
Adds a banner to each compiled and minified source .js file.
*/

import { BannerPlugin } from "@rspack/core";
const DASHES = "--------------------------";

export default function bannerPlugin(registerPlugin, params) {
  const banner = `\
This file is part of ${params.TITLE}.  It was compiled at ${params.BUILD_DATE} from Git revision
${params.COCALC_GIT_REVISION} and version ${params.SMC_VERSION}.
See ${params.COCALC_GITHUB_REPO} for its ${params.COCALC_LICENSE} licensed code.\
`;
  console.log(`\n${DASHES}\n${banner}\n${DASHES}\n`);

  registerPlugin(
    "BannerPlugin -- adds banner to each compiled source .js file",
    new BannerPlugin({
      banner,
      entryOnly: true,
    })
  );
}
