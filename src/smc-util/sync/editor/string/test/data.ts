/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { client_db } from "../../../../schema";

export function a_txt() {
  const project_id = "ae1d6165-1310-4949-b266-e0448fdd065f";
  const path = "a.txt";
  const string_id = client_db.sha1(project_id, path);
  const client_id = "72570709-2eb2-499f-a7d2-38978d8c7393";
  return {
    client_id,
    project_id,
    path,
    string_id,
    init_queries: {
      syncstrings: [
        {
          snapshot_interval: 5,
          project_id,
          path,
          users: [project_id, client_id],
          string_id,
          last_active: "2019-01-04T18:24:08.806Z",
          init: { time: "2019-01-04T18:24:09.878Z", size: 0, error: "" },
          doctype: '{"type":"string"}',
          read_only: false,
          deleted: false,
          save: { state: "done", error: "", hash: 0, time: 1546626249624 },
        },
      ],
    },
  };
}
