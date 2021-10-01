import basePath from "@cocalc/util-node/base-path";

export const COOKIE_NAME = `${
  basePath.length <= 1 ? "" : encodeURIComponent(basePath)
}remember_me`;
