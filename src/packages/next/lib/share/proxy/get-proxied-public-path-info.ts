// Get public path info for public path defined by url proxy which is assumed
// to already exist in the database.

import getPublicPathInfoGithub from "./get-public-path-info-github";
import getPublicPathInfoUrl from "./get-public-path-info-url";
import getPublicPathInfoGist from "./get-public-path-info-gist";
import { join } from "path";
``;

export default async function getProxiedPublicPathInfo(
  url: string,
  segments: string[]
) {
  if (url.startsWith("github/")) {
    return await getPublicPathInfoGithub(join(url, ...segments.slice(1)));
  }
  if (url.startsWith("url/")) {
    return await getPublicPathInfoUrl(url);
  }
  if (url.startsWith("gist/")) {
    return await getPublicPathInfoGist(url);
  }
  throw Error(`unknown proxy url schema -- "${url}"`);
}
