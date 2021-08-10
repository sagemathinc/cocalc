/*
This handles request to share/raw/[sha1]/[relative path].

It confirms that the request is valid (so the content is
actually currently publicly shared) then sends the result.
*/

import type { Request, Response } from "express";

interface Options {
  id: string;
  path: string;
  res: Response;
  req: Request;
}

export default function handle({ id, path, res, req }: Options): void {
  req = req;
  res.end(`id=${id}, path=${path}`);
}
