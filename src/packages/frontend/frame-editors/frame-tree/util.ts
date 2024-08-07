/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Utility functions useful for frame-tree editors.
*/

import { path_split, separate_file_extension } from "@cocalc/util/misc";
import { encode_path } from "@cocalc/util/misc";
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
  // we have to encode the path, since we query this raw server. see
  // https://github.com/sagemathinc/cocalc/issues/5542
  // but actually, this is a problem for types of files, not just PDF
  const path_enc = encode_path(path);
  return join(appBasePath, project_id, "raw", path_enc);
}
