/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useTypedRedux } from "@cocalc/frontend/app-framework";

import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import ApiKeys from "./settings/api-keys";
import GlobalSSHKeys from "./ssh-keys/global-ssh-keys";

import type { IconName } from "@cocalc/frontend/components/icon";

// Icon constant for account preferences section
export const KEYS_ICON_NAME: IconName = "key";

export function AccountPreferencesSecurity() {
  const kucalc = useTypedRedux("customize", "kucalc");
  const ssh_gateway = useTypedRedux("customize", "ssh_gateway");

  return (
    <>
      {(ssh_gateway || kucalc === KUCALC_COCALC_COM) && <GlobalSSHKeys />}
      <ApiKeys />
    </>
  );
}
