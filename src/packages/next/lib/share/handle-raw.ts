/*
This handles request to share/raw/[sha1]/[relative path].

It confirms that the request is valid (so the content is
actually currently publicly shared) then sends the result.
*/

import type { Request, Response } from "express";
import { static as ExpressStatic } from "express";
import LRU from "lru-cache";
import ms from "ms";
import { join } from "path";
import DirectoryListing from "serve-index";

import { pathFromID } from "./path-to-files";
import { getExtension, isSha1Hash } from "./util";

const MAX_AGE = Math.round(ms("15 minutes") / 1000);

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

async function handleRequest(opts: Options): Promise<void> {
  const {
    id, // id of a public_path
    path: pathEncoded, // full path in the project to requested file or directory
    req,
    res,
    download,
    next,
  } = opts;
  res.setHeader("Cache-Control", `public, max-age=${MAX_AGE}`);

  if (!isSha1Hash(id)) {
    throw Error(`id=${id} is not a sha1 hash`);
  }

  // store the URI decoded string from pathEncoded in path
  // BUGFIX: https://github.com/sagemathinc/cocalc/issues/5928
  // This does not work with file names containing a percent sign, because next.js itself does decode the path as well.
  const path = decodeURIComponent(pathEncoded);

  // the above must come before this check (since dots could be somehow encoded)
  if (path.includes("..")) {
    throw Error(`path (="${path}") must not include ".."`);
  }

  let { fsPath, projectPath } = await pathFromID(id);

  if (!path.startsWith(projectPath)) {
    // The projectPath absolutely must be an initial segment of the requested path.
    // We do NOT just use a relative path *inside* the share, because the share might be a file itself
    // and then the MIME type wouldn't be a function of the URL.
    throw Error(`path (="${path}") must start with "${projectPath}"`);
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

  req.url = url;
  staticHandler(fsPath, req, res, next);
}

export function staticHandler(
  fsPath: string,
  req: Request,
  res: Response,
  next: Function,
) {
  // console.log("staticHandler", { fsPath, url: req.url });
  const handler = getStaticFileHandler(fsPath);
  // @ts-ignore -- TODO
  handler(req, res, () => {
    // Static handler didn't work, so try the directory listing handler.
    //console.log("directoryHandler", { fsPath, url: req.url });
    const handler = getDirectoryHandler(fsPath);
    try {
      handler(req, res, next);
    } catch (err) {
      // I noticed in logs that if reeq.url is malformed then this directory listing handler --
      // which is just some old middleware not updated in 6+ years -- can throw an exception
      // which is not caught.  So we catch it here and respond with some sort of generic
      // server error, but without crashing the server.
      // Respond with a 500 Internal Server Error status code.
      if (!res.headersSent) {
        res
          .status(500)
          .send(
            `Something went wrong on the server, please try again later. -- ${err}`,
          );
      } else {
        // In case headers were already sent, end the response without sending any data.
        res.end();
      }
    }
  });
}

const staticFileCache = new LRU<string, ReturnType<typeof ExpressStatic>>({
  max: 200,
});
function getStaticFileHandler(path: string): ReturnType<typeof ExpressStatic> {
  const sfh = staticFileCache.get(path);
  if (sfh) {
    return sfh;
  }
  const handler = ExpressStatic(path);
  staticFileCache.set(path, handler);
  return handler;
}

const directoryCache = new LRU<string, ReturnType<typeof DirectoryListing>>({
  max: 200,
});
function getDirectoryHandler(
  path: string,
): ReturnType<typeof DirectoryListing> {
  const dh = directoryCache.get(path);
  if (dh) {
    return dh;
  }
  const handler = DirectoryListing(path, { icons: true, view: "details" });
  directoryCache.set(path, handler);
  return handler;
}
