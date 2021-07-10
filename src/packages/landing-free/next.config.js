// next.js defines / to be an invalid basepath, whereas in cocalc it is valid:

const basePath =
  process.env.BASE_PATH == "/"
    ? ""
    : process.env.BASE_PATH
    ? process.env.BASE_PATH
    : "";

module.exports = {
  basePath,
  env: {
    BASE_PATH: basePath, // make visible to frontend code.
    CUSTOMIZE: process.env.CUSTOMIZE
      ? process.env.CUSTOMIZE
      : JSON.stringify({ siteName: "CoCalc" }),
  },
  reactStrictMode: true,
  eslint: {
    // Warning: Dangerously allow production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
};
