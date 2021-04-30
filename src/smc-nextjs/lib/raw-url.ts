/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export default function rawURL(
  id: string,
  path: string,
  basePath?: string
): string {
  return `${basePath ?? ""}/raw/${id}/${encodeURIComponent(path)}`;
}
