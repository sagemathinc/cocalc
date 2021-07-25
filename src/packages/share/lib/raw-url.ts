/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export default function rawURL(
  id: string,
  relativePath: string,
  basePath?: string
): string {
  return `${basePath ?? ""}/public_paths/raw/${id}/${encodePath(relativePath)}`;
}

export function encodePath(path: string) {
  const segments = path.split("/");
  const encoded: string[] = [];
  for (const segment of segments) {
    encoded.push(encodeURIComponent(segment));
  }
  return encoded.join("/");
}

