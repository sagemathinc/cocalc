/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import ApiKeysTables from "@cocalc/frontend/components/api-keys";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { SettingBox } from "@cocalc/frontend/components";

const manage = (opts) => webapp_client.account_client.api_keys(opts);

export default function ApiKeys() {
  return (
    <SettingBox title="API Keys" icon={"api"}>
      <ApiKeysTables manage={manage} />
    </SettingBox>
  );
}
