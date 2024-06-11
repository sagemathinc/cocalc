/*
Each of the functions listed here will get automatically called every couple
of minutes as part of the general storage maintenance functionality.
*/

import {
  deleteMaintenance,
  serviceAccountMaintenance,
} from "@cocalc/server/compute/cloud-filesystem/delete";

export const tasks = [
  {
    f: deleteMaintenance,
    desc: "ensure buckets eventually get deleted even if something goes wrong",
  } as const,
  {
    f: serviceAccountMaintenance,
    desc: "ensure service accounts that aren't in use for a while are automatically deleted",
  } as const,
];
