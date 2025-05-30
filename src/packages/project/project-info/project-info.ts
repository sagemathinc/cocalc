/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Project information
*/

import { ProjectInfoServer } from "./server";

// singleton, we instantiate it when we need it
let _info: ProjectInfoServer | undefined = undefined;

export function get_ProjectInfoServer(): ProjectInfoServer {
  if (_info != null) return _info;
  _info = new ProjectInfoServer();
  return _info;
}
