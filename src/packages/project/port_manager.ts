/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { readFile } from "node:fs/promises";

import { abspath } from "@cocalc/backend/misc_node";

type Type = "sage";

/*
The port_manager manages the ports for the various servers.

It reads the port from memory or from disk and returns it.
*/

const { SMC } = process.env;

function port_file(type: Type): string {
  return `${SMC}/${type}_server/${type}_server.port`;
}

// a local cache
const ports: { [type in Type]?: number } = {};

export async function get_port(type: Type): Promise<number> {
  const val = ports[type];
  if (val != null) {
    return val;
  } else {
    const content = await readFile(abspath(port_file(type)));
    try {
      const val = parseInt(content.toString());
      ports[type] = val;
      return val;
    } catch (e) {
      throw new Error(`${type}_server port file corrupted`);
    }
  }
}

export function forget_port(type: Type) {
  if (ports[type] != null) {
    delete ports[type];
  }
}
