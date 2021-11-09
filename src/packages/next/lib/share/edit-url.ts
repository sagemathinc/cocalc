/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import basePath from "lib/base-path";

interface AnonymousOptions {
  id: string;
  path: string;
  relativePath: string;
  type: "anonymous";
}

interface CollaboratorOptions {
  project_id: string;
  path?: string; // no path means link to project
  relativePath?: string;
  type?: "collaborator";
}

type Options = AnonymousOptions | CollaboratorOptions;

export default function editURL(options: Options): string {
  const type = options["type"];
  switch (type) {
    case "anonymous":
      return anonymousURL(options);
    case "collaborator":
    default:
      return collaboratorURL(options);
  }
}

function withBasePath(url: string): string {
  return join(basePath, url);
}

function anonymousURL({ id, path, relativePath }): string {
  const app = "/static/app.html";
  return withBasePath(
    encodeURI(
      `${app}?anonymous=true&launch=share/${id}/${join(
        path,
        relativePath ?? ""
      )}`
    )
  );
}

function collaboratorURL({
  project_id,
  path,
  relativePath,
}: {
  project_id: string;
  path?: string;
  relativePath?: string;
}): string {
  const projectURL = join("/projects", project_id);
  if (!path) {
    return withBasePath(projectURL);
  }
  return withBasePath(join(projectURL, "files", path, relativePath ?? ""));
}
