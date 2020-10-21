/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface SiteLicensePublicInfo {
  id: string;
  title: string;
  description: string;
  activates?: Date;
  expires?: Date;
  run_limit?: number;
  upgrades?: { [field: string]: number };
  is_manager?: boolean;
  managers?: string[];
  running?: number;
  quota?: {
    ram?: number;
    cpu?: number;
    disk?: number;
    always_running?: boolean;
    member?: boolean;
    user?: "academic" | "business";
  };
}
