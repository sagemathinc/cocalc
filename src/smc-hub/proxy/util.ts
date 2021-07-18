import basePath from "smc-util-node/base-path";

/*
Strip the base path from a url.
The resulting url will start with a /.
*/

export function stripBasePath(url: string): string {
  if (basePath.length <= 1) {
    // base path is just "/" so do NOT remove anything.
    return url;
  }
  // base path is something like "/foo/bar", so remove it.
  // In particular, it does not end in a /.
  return url.slice(basePath.length);
}
