/*
This handles request to share/raw/[sha1]/[relative path].

It confirms that the request is valid (so the content is
actually currently publicly shared) then sends the result.
*/

import type { Request, Response } from "express";
import { static as ExpressStatic } from "express";
import { isSha1Hash } from "./util";
import { pathFromID } from "./path-to-files";

interface Options {
  id: string;
  path: string;
  res: Response;
  req: Request;
  next: () => void;
}

export default async function handle(options: Options): Promise<void> {
  try {
    await handleRequest(options);
  } catch (err) {
    // some other error
    options.res.send(`Error: ${err}`);
  }
}

async function handleRequest({ id, path, req, res, next }: Options): Promise<void> {
  if (!isSha1Hash(id)) {
    throw Error(`id=${id} is not a sha1 hash`);
  }
  const filePath = await pathFromID(id);
  const handler = ExpressStatic(filePath);
  req.url = path;
  handler(req, res, next);
  //res.end(`id=${id}, path=${path}, filePath=${filePath}`);
}
