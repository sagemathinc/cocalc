/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface Upgrades {
  disk_quota?: number;
  cores?: number;
  cpu_shares?: number;
  memory?: number;
  memory_request?: number;
  mintime?: number;
  network?: number;
  member_host?: number;
  ephemeral_state?: number;
  ephemeral_disk?: number;
}
