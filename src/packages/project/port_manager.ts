/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { readFile } from "node:fs/promises";

import { abspath } from "@cocalc/backend/misc_node";

/*
The port_manager manages the ports for the various servers.

It reads the port from memory or from disk and returns it.
*/

const { SMC } = process.env;

export function port_file(type): string {
  return `${SMC}/${type}_server/${type}_server.port`;
}

const ports = {};

export async function get_port(type): Promise<number> {
  if (ports[type] != null) {
    return ports[type];
  } else {
    const content = await readFile(abspath(port_file(type)));
    try {
      ports[type] = parseInt(content.toString());
      return ports[type];
    } catch (e) {
      throw new Error(`${type}_server port file corrupted`);
    }
  }
}

export function forget_port(type) {
  if (ports[type] != null) {
    return delete ports[type];
  }
}
