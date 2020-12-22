/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Utility functions useful for frame-tree editors.
*/

import { path_split, separate_file_extension } from "smc-util/misc";
export { aux_file } from "smc-util/misc";

export function parse_path(
  path: string
): { directory: string; base: string; filename: string } {
  const x = path_split(path);
  const y = separate_file_extension(x.tail);
  return { directory: x.head, base: y.name, filename: x.tail };
}

/* Declare that window has an extra app_base_url string param. */

declare global {
  interface Window {
    app_base_url: string;
  }
}

export function raw_url(project_id: string, path: string): string {
  return `${window.app_base_url}/${project_id}/raw/${path}`;
}

