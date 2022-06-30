/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PathContents } from "lib/share/get-contents";
import { rawText, contents } from "./api";

/*
export interface PathContents {
  isdir?: boolean;
  listing?: FileInfo[];
  content?: string;
  size?: number;
  mtime?: number;
  truncated?: string;
}

export interface FileInfo {
  name: string;
  error?: Error;
  isdir?: boolean;
  size?: number;
  mtime?: number;
}

*/

export default async function getContents(
  _id: string,
  githubOrg: string,
  githubRepo: string,
  segments: string[]
): Promise<PathContents> {
  switch (segments[0]) {
    case undefined:
    case "tree":
      // directory listing
      const response = await contents(githubOrg, githubRepo, segments);
      console.log(response);
      if (response.message) {
        throw Error(`${response.message}  (see ${response.documentation_url})`);
      }
      if (response.name != null) {
        // it's a file rather than a directory
        throw Error("not implemented");
      }
      const listing: FileInfo[] = [];
      for (const file of response) {
        listing.push({ name: file.name, size: file.size });
      }
      return { isdir: true, listing };
      break;
    case "blob":
      const content = await rawText(githubOrg, githubRepo, segments);
      return { content, size: content.length };
    default:
      throw Error("not implemented");
  }
}
