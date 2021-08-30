/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import basePath from "lib/base-path";

interface Options {
  id: string;
  path: string;
  dns?: string;
}

export default function editURL({ id, path, dns }: Options): string {
  const url = encodeURI(
    `static/app.html?anonymous=true&launch=share/${id}/${path}`
  );
  if (dns) {
    // if dns explicitly specified open on that machine, e.g. share.cocalc.com versus cocalc.com
    return `https://${dns}/${url}`;
  }
  return join(basePath, url);
}
