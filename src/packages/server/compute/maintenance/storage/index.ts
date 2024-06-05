/*
Each of the functions listed here will get automatically called every couple
of minutes as part of the general storage maintenance functionality.
*/

import { deleteMaintenance } from "@cocalc/server/compute/delete-storage";

export const task = {
  f: deleteMaintenance,
  desc: "ensure buckets eventually get deleted even if something goes wrong",
} as const;
