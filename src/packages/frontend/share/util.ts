/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import { encode_path } from "@cocalc/util/misc";
import { client_db } from "@cocalc/util/schema";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { redux } from "@cocalc/frontend/app-framework";

export function share_id(project_id: string, path: string): string {
  return client_db.sha1(project_id, path); // Consistent with @cocalc/util/db-schema...
}

// Returns optimal URL for this share, taking into account
// vanity names.
export function publicShareUrl(
  project_id: string,
  public_path: string,
  file_path: string
): string {
  if (!file_path.startsWith(public_path)) {
    throw Error(`${file_path} must start with ${public_path}`);
  }
  const relativePath = encode_path(file_path.slice(public_path.length));
  const id = share_id(project_id, public_path);
  const userName = redux.getStore("account").get("name");
  if (userName) {
    // nicer vanity url
    const projectName = redux
      .getStore("projects")
      .getIn(["project_map", project_id, "name"]);
    if (projectName) {
      const publicPathName = redux
        .getProjectStore(project_id)
        .getIn(["public_paths", id, "name"]);
      if (publicPathName) {
        return `${serverUrl()}/${join(
          userName,
          projectName ? projectName : project_id,
          publicPathName ? publicPathName : id
        )}${relativePath ? join("/files", relativePath) : ""}`;
      }
    }
  }

  return `${shareServerUrl()}/public_paths/${join(id, relativePath)}`;
}

export function shareServerUrl(): string {
  return `${serverUrl()}/share`;
}

function serverUrl(): string { // does NOT end in a slash
  return `${document.location.origin}${appBasePath == "/" ? "" : appBasePath}`;
}
