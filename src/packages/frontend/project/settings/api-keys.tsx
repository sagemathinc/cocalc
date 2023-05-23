/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useCallback } from "react";
import ApiKeysTables from "@cocalc/frontend/components/api-keys";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { SettingBox } from "@cocalc/frontend/components";

export function ApiKeys({ project_id }) {
  const manage = useCallback(
    async (opts) => {
      return await webapp_client.project_client.api_keys({
        ...opts,
        project_id,
      });
    },
    [project_id]
  );
  return (
    <SettingBox title="Project API Keys" icon={"api"}>
      <ApiKeysTables manage={manage} />
    </SettingBox>
  );
}
