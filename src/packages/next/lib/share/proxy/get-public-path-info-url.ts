/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// provided by nextjs: https://nextjs.org/blog/next-9-4#improved-built-in-fetch-support
declare var fetch;

import { RAW_MAX_SIZE_BYTES } from "./api";

export default async function getPublicPathInfoUrl(url: string) {
  if (!url.startsWith("url/")) {
    throw Error("url must start with 'url/'");
  }
  // TODO: more than just text documents...
  let content: string | undefined = undefined;
  let err: Error | undefined = undefined;
  for (const start of ["https://", "http://"]) {
    try {
      content = await (
        await fetch(`${start}${url.slice("url/".length)}`, {
          size: RAW_MAX_SIZE_BYTES,
        })
      ).text();
      break;
    } catch (_err) {
      err = _err;
    }
  }
  if (content == null) {
    throw err;
  }
  return {
    contents: { content, size: content.length },
    relativePath: "",
    projectTitle: `Document at ${url}`,
  };
}
