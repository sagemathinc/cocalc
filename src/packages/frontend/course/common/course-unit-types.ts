/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { AssignmentRecord, HandoutRecord } from "../store";
import type { AssignmentStatus } from "../types";

export type HandoutStatus = { handout: number; not_handout: number };
export type UnitStatus = AssignmentStatus | HandoutStatus;

export function isAssignmentUnit(
  unit: AssignmentRecord | HandoutRecord,
): unit is AssignmentRecord {
  return (unit as AssignmentRecord).get("assignment_id") != null;
}
