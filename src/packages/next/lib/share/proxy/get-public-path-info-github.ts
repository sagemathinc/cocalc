/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getContents from "./get-contents";
import { join } from "path";

export default async function getPublicPathInfoGithub(url: string) {
  const segments = url.split("/");
  const githubOrg = segments[1];
  if (!githubOrg) {
    throw Error(`invalid url ${url} -- must include github organization`);
  }
  const githubRepo = segments[2];
  const relativePath = join(...segments.slice(3));

  if (!githubRepo) {
    // only getting the repos for a single org.
    const contents = await getContents(githubOrg, "", []);
    const projectTitle = `GitHub Repositories owned by ${githubOrg}`;

    return {
      contents,
      relativePath,
      projectTitle,
      githubOrg,
    };
  }

  const contents = await getContents(githubOrg, githubRepo, segments.slice(3));
  const projectTitle = `GitHub repository ${githubOrg} / ${githubRepo}`;

  return {
    contents,
    relativePath,
    projectTitle,
    githubOrg,
    githubRepo,
    url,
  };
}
