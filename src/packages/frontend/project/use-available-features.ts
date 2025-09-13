/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { ALL_AVAIL } from "@cocalc/frontend/project_configuration";

// ws: I fundamentally disagree with this. We should show what we support,
// and make it easy to install support for things that aren't installed.
const DISABLED = true;

export function useAvailableFeatures(project_id: string) {
  if (DISABLED) {
    return ALL_AVAIL;
  }

  const available_features = useTypedRedux(
    { project_id },
    "available_features",
  );

  // If the configuration is not yet available, we default to the *most likely*
  // configuration, not the least likely configuration.
  // See https://github.com/sagemathinc/cocalc/issues/4293
  // This is also consistent with src/@cocalc/frontend/project/explorer/new-button.tsx
  return available_features?.toJS() ?? ALL_AVAIL;
}
