/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { readFile } from "node:fs";

import { abspath } from "@cocalc/backend/misc_node";
import { CB } from "@cocalc/util/types/database";

/*
The port_manager manages the ports for the various servers.

It reads the port from memory or from disk and returns it.
*/

const { SMC } = process.env;

export function port_file(type) : string {
  return `${SMC}/${type}_server/${type}_server.port`;
}

const ports = {};

export function get_port(type, cb: CB<number>) {
  if (ports[type] != null) {
    cb(null, ports[type]);
  } else {
    readFile(abspath(port_file(type)), function (err, content) {
      if (err) {
        cb(err);
      } else {
        try {
          ports[type] = parseInt(content.toString());
          cb(null, ports[type]);
        } catch (e) {
          cb(`${type}_server port file corrupted`);
        }
      }
    });
  }
}

export function forget_port(type) {
  if (ports[type] != null) {
    return delete ports[type];
  }
}
