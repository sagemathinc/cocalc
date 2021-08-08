/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Utility functions useful for frame-tree editors.
*/

import { path_split, separate_file_extension } from "@cocalc/util/misc";
import { aux_file } from "@cocalc/util/misc";
export { aux_file };
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export function parse_path(path: string): {
  directory: string;
  base: string;
  filename: string;
} {
  const x = path_split(path);
  const y = separate_file_extension(x.tail);
  return { directory: x.head, base: y.name, filename: x.tail };
}

export function raw_url(project_id: string, path: string): string {
  return join(appBasePath, project_id, "raw", path);
}
