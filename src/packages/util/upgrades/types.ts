/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this is used by the frontend in some places, but not by the quota function
// the two "boolean" types are suspicious – should be number as well (0 or 1).
export interface Upgrades {
  disk_quota?: number;
  cores?: number;
  cpu_shares?: number;
  memory?: number;
  memory_request?: number;
  mintime?: number;
  network?: number;
  member_host?: boolean;
  ephemeral_state?: number;
  ephemeral_disk?: number;
  always_running?: boolean;
}
