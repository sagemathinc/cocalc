/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { encodePath } from "./raw-url";

export default function downloadURL(
  id: string,
  relativePath: string,
  basePath?: string
): string {
  return `${basePath ?? ""}/public_paths/download/${id}/${encodePath(relativePath)}`;
}
