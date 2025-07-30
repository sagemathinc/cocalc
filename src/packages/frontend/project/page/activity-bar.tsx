/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ACTIVITY_BAR_OPTIONS } from "./activity-bar-consts";

// If not set, default is full pages
// https://github.com/sagemathinc/cocalc/issues/8475
function getDefaultActivityBarOption(): keyof typeof ACTIVITY_BAR_OPTIONS {
  return "full";
}

export function getValidActivityBarOption(
  activityBarSetting: any,
): keyof typeof ACTIVITY_BAR_OPTIONS {
  if (
    typeof activityBarSetting !== "string" ||
    ACTIVITY_BAR_OPTIONS[activityBarSetting] == null
  ) {
    return getDefaultActivityBarOption();
  }
  return activityBarSetting as keyof typeof ACTIVITY_BAR_OPTIONS;
}
