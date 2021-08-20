/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { appBasePath } from "./customize";

interface Options {
  id: string;
  path: string;
}

export default function editURL({ id, path }: Options): string {
  return encodeURI(
    `${appBasePath}/app?anonymous=true&launch=share/${id}/${path}`
  );
}
