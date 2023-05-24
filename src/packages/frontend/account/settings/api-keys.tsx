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
      <p>
        You can also make project specific api keys in any project's settings.
        If you only need to use the API to access one project, these are safer.
      </p>
    </SettingBox>
  );
}
