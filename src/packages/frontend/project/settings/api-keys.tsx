/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useCallback } from "react";
import ApiKeysTables from "@cocalc/frontend/components/api-keys";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { SettingBox } from "@cocalc/frontend/components";

interface Props {
  project_id: string;
  mode?: "project" | "flyout";
}

export function ApiKeys({ project_id, mode = "project" }: Props) {
  const manage = useCallback(
    async (opts) => {
      return await webapp_client.project_client.api_keys({
        ...opts,
        project_id,
      });
    },
    [project_id]
  );

  if (mode === "flyout") {
    return <ApiKeysTables manage={manage} mode={mode} />;
  } else {
    return (
      <SettingBox title="API Keys" icon={"api"}>
        <ApiKeysTables manage={manage} />
      </SettingBox>
    );
  }
}
