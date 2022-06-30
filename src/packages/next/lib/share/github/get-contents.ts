/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PathContents } from "lib/share/get-contents";
import fetch from "node-fetch";
import { join } from "path";

/*
export interface PathContents {
  isdir?: boolean;
  listing?: FileInfo[];
  content?: string;
  size?: number;
  mtime?: number;
  truncated?: string;
}

*/

// We don't allow just fetching content that is arbitrarily large, since that could cause
// the server to just run out of memory.  However, we want this to reasonably big.
const MAX_SIZE_BYTES = 25000000; // 25MB

export default async function getContents(
  _id: string,
  githubOrg: string,
  githubProject: string,
  segments: string[]
): Promise<PathContents> {
  const url = rawURL(githubOrg, githubProject, segments);
  console.log({ url });
  const content = await (await fetch(url, { size: MAX_SIZE_BYTES })).text();
  return { content };
}

function rawURL(
  githubOrg: string,
  githubProject: string,
  segments: string[]
): string {
  return `https://raw.githubusercontent.com/${githubOrg}/${githubProject}/${join(
    ...segments.slice(1)
  )}`;
}
