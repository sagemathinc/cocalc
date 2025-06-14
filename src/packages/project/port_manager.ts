/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { readFile } from "node:fs/promises";
import { sageServerPaths } from "@cocalc/project/data";

type Type = "sage";

/*
The port_manager manages the ports for the sage worksheet server.
*/

// a local cache
const ports: { [type in Type]?: number } = {};

export async function get_port(type: Type = "sage"): Promise<number> {
  const val = ports[type];
  if (val != null) {
    return val;
  } else {
    const content = await readFile(sageServerPaths.port);
    try {
      const val = parseInt(content.toString());
      ports[type] = val;
      return val;
    } catch (err) {
      throw new Error(`${type}_server port file corrupted -- ${err}`);
    }
  }
}

export function forget_port(type: Type = "sage") {
  if (ports[type] != null) {
    delete ports[type];
  }
}
