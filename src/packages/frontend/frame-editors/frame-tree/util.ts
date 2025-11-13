/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Utility functions useful for frame-tree editors.
*/

import { path_split, separate_file_extension } from "@cocalc/util/misc";
import { fileURL } from "@cocalc/frontend/lib/cocalc-urls";
import { getComputeServerId } from "@cocalc/frontend/frame-editors/generic/client";

export function parse_path(path: string): {
  directory: string;
  base: string;
  filename: string;
} {
  const x = path_split(path);
  const y = separate_file_extension(x.tail);
  return { directory: x.head, base: y.name, filename: x.tail };
}

export function raw_url(
  project_id: string,
  path: string,
  compute_server_id?: number,
  param?: string,
): string {
  return fileURL({
    project_id,
    path,
    compute_server_id:
      compute_server_id ?? getComputeServerId({ project_id, path }),
    param,
  });
}
