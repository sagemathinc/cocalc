// Get public path info for public path defined by url proxy which is assumed
// to already exist in the database.

import getPublicPathInfoGithub from "./get-public-path-info-github";
import getPublicPathInfoUrl from "./get-public-path-info-url";
import getPublicPathInfoGist from "./get-public-path-info-gist";
import { join } from "path";
``;

export default async function getProxiedPublicPathInfo(
  url: string,
  segments?: string[]
) {
  if (url.startsWith("github/")) {
    return await getPublicPathInfoGithub(
      segments == null ? url : join(url, ...segments.slice(1))
    );
  }
  if (url.startsWith("gist/")) {
    return await getPublicPathInfoGist(url);
  }
  // This is disabled now since it is easy for spammers to take advantage of this,
  // and also when people paste general URL's in they are almost never the actual
  // raw url of a notebook, but instead a general HTML page that has something like
  // a notebook in it, and they just get confused.
  //   if (url.startsWith("url/")) {
  //     return await getPublicPathInfoUrl(url);
  //   }
  throw Error(
    `unsupported proxy url schema -- "${url}" -- url must be hosted on GitHub`
  );
}
