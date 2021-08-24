/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import { encode_path } from "@cocalc/util/misc";
import { client_db } from "@cocalc/util/schema";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export function share_id(project_id: string, path: string): string {
  return client_db.sha1(project_id, path); // Consistent with @cocalc/util/db-schema...
}

export function publicShareUrl(
  project_id: string,
  public_path: string,
  file_path: string
): string {
  if (!file_path.startsWith(public_path)) {
    throw Error(`${file_path} must start with ${public_path}`);
  }
  const relativePath = encode_path(file_path.slice(public_path.length));
  return `${shareServerUrl()}/public_paths/${join(
    share_id(project_id, public_path),
    relativePath
  )}`;
}

export function shareServerUrl(): string {
  // Even if content is served from a separate domain, we assume that
  // {base}/share will redirect to it.
  return `${document.location.origin}${join(appBasePath, "share")}`;
}
