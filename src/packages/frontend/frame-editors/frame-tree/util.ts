/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Utility functions useful for frame-tree editors.
*/

import { path_split, separate_file_extension } from "@cocalc/util/misc";
import rawUrl from "@cocalc/frontend/lib/raw-url";

export function parse_path(path: string): {
  directory: string;
  base: string;
  filename: string;
} {
  const x = path_split(path);
  const y = separate_file_extension(x.tail);
  return { directory: x.head, base: y.name, filename: x.tail };
}

// todo: rewrite everything that calls this...
export function raw_url(project_id: string, path: string): string {
  return rawUrl({ project_id, path });
}
