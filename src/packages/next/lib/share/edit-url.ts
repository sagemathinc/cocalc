/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";

interface AnonymousOptions {
  id: string;
  path: string;
  relativePath: string;
  siteURL?: string;
  type: "anonymous";
}

interface CollaboratorOptions {
  project_id: string;
  path?: string; // no path means link to project
  relativePath?: string;
  siteURL?: string;
  type: "collaborator";
}

type Options = AnonymousOptions | CollaboratorOptions;

export default function editURL(options: Options): string {
  switch (options.type) {
    case "anonymous":
      return anonymousURL(options);
    case "collaborator":
      return collaboratorURL(options);
    default:
      throw Error(`unknown type ${options.type}`);
  }
}

function anonymousURL({ id, path, relativePath, siteURL }): string {
  const app = "/static/app.html";
  const url = encodeURI(
    `${app}?anonymous=true&launch=share/${id}/${join(path, relativePath ?? "")}`
  );
  return withSiteURL(url, siteURL);
}

function withSiteURL(url: string, siteURL?: string): string {
  if (siteURL) {
    return `${siteURL}${url}`;
  }
  return url;
}

function collaboratorURL({ project_id, path, relativePath, siteURL }): string {
  const projectURL = join("/projects", project_id);
  const url = path ? join(projectURL, "files", path, relativePath) : projectURL;
  return withSiteURL(url, siteURL);
}
