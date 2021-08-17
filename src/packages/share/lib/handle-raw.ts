/*
This handles request to share/raw/[sha1]/[relative path].

It confirms that the request is valid (so the content is
actually currently publicly shared) then sends the result.
*/

import { join } from "path";
import type { Request, Response } from "express";
import { static as ExpressStatic } from "express";
import DirectoryListing from "serve-index";
import { getExtension, isSha1Hash } from "./util";
import { pathFromID } from "./path-to-files";
import LRU from "lru-cache";

interface Options {
  id: string;
  path: string;
  res: Response;
  req: Request;
  download?: boolean; // if true, cause download
  next: (value?) => void;
}

export default async function handle(options: Options): Promise<void> {
  try {
    await handleRequest(options);
  } catch (err) {
    // some other error
    options.res.send(`Error: ${err}`);
  }
}

async function handleRequest({
  id, // id of a public_path
  path, // full path in the project to requested file or directory
  req,
  res,
  download,
  next,
}: Options): Promise<void> {
  if (!isSha1Hash(id)) {
    throw Error(`id=${id} is not a sha1 hash`);
  }
  if (path.includes("..")) {
    throw Error(`path (="${path}") must not include ".."`);
  }
  let { fsPath, projectPath } = await pathFromID(id);
  if (!path.startsWith(projectPath)) {
    // The projectPath absolutely must be an initial
    // segment of the requested path.  We do NOT just
    // use a relative path *inside* the share, because
    // the share might be a file itself and then the
    // MIME type wouldn't be a function of the URL.
    throw Error(`path (="${path}") must start with "${projectPath}" ".."`);
  }
  let url = path.slice(projectPath.length);
  const target = join(fsPath, url);

  const ext = getExtension(target);
  if (download || ext == "html" || ext == "svg") {
    // NOTE: We *always* download .html, since it is far too dangerous to render
    // an arbitrary html file from our domain.
    res.download(target, next);
    return;
  }

  if (!url) {
    const i = fsPath.lastIndexOf("/");
    if (i == -1) {
      // This can't actually happen, since fsPath is an absolute filesystem path, hence starts with /
      throw Error(`invalid fsPath=${fsPath}`);
    }
    url = fsPath.slice(i);
    fsPath = fsPath.slice(0, i);
  }
  const handler = getStaticHandler(fsPath);
  req.url = url;
  handler(req, res, () => {
    // Static handler didn't work, so try the directory listing handler.
    const handler = getDirectoryHandler(fsPath);
    handler(req, res, next);
  });
}

const staticCache = new LRU({ max: 200 });
function getStaticHandler(path: string) {
  if (staticCache.has(path)) {
    return staticCache.get(path);
  }
  const handler = ExpressStatic(path);
  staticCache.set(path, handler);
  return handler;
}

const directoryCache = new LRU({ max: 200 });
function getDirectoryHandler(path: string) {
  if (directoryCache.has(path)) {
    return directoryCache.get(path);
  }
  const handler = DirectoryListing(path, { icons: true, view: "details" });
  directoryCache.set(path, handler);
  return handler;
}
