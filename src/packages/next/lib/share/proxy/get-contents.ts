/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { FileInfo, PathContents } from "lib/share/get-contents";
import { rawText, contents, defaultBranch, repos } from "./api";
import { join } from "path";
import { field_cmp } from "@cocalc/util/cmp";

export default async function getContents(
  githubOrg: string,
  githubRepo: string,
  segments: string[],
): Promise<PathContents> {
  if (!githubRepo) {
    // get all repos attached to an org
    const listing = await repos(githubOrg);
    listing.sort(field_cmp("mtime"));
    listing.reverse();
    return { listing };
  }

  switch (segments[0]) {
    case undefined:
    case "tree":
      // directory listing
      const response = await contents(githubOrg, githubRepo, segments);
      if (response["name"] != null) {
        // it's a file rather than a directory
        throw Error("not implemented");
      }
      const branch =
        segments[0] == null
          ? await defaultBranch(githubOrg, githubRepo)
          : segments[1];
      const listing: FileInfo[] = [];
      for (const file of response) {
        const isdir = file.type == "dir";
        let url;
        if (isdir) {
          if (segments[0] == null) {
            url = `/github/${githubOrg}/${githubRepo}/${join(
              "tree",
              branch,
              ...segments,
              file.name,
            )}`;
          } else {
            url = `/github/${githubOrg}/${githubRepo}/${join(
              ...segments,
              file.name,
            )}`;
          }
        } else {
          if (segments[0] == null) {
            url = `/github/${githubOrg}/${githubRepo}/${join(
              "blob",
              branch,
              ...segments,
              file.name,
            )}`;
          } else {
            url = `/github/${githubOrg}/${githubRepo}/${join(
              "blob",
              segments[1],
              ...segments.slice(2),
              file.name,
            )}`;
          }
        }
        listing.push({
          url,
          name: file.name,
          isdir,
          ...(file.type == "file" ? { size: file.size } : undefined),
        });
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
