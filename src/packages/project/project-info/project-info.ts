/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Project information
*/

import { ProjectInfoServer } from "./server";
import { createService } from "@cocalc/conat/project/project-info";
import { project_id, compute_server_id } from "@cocalc/project/data";

// singleton, we instantiate it when we need it
let info: ProjectInfoServer | null = null;
let service: any = null;

export function get_ProjectInfoServer(): ProjectInfoServer {
  if (info != null) {
    return info;
  }
  info = new ProjectInfoServer();
  service = createService({ infoServer: info, project_id, compute_server_id });

  return info;
}

export function close() {
  service?.close();
  info?.close();
  info = service = null;
}
