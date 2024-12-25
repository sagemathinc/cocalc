/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// This configures the datastore configuration for student and the shared project.
// basically: if it is "true", the datastore config of the teacher project is looked up when the project starts
// and used to configure it in read-only mode. In the future, a natural extension is to explicitly list the datastores
// that should be inherited, or configure the readonly property. but for now, it's just true or false.

import { useEffect, useState } from "react";
import { ConfigurationActions } from "./actions";
import { Card } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { computeServersEnabled } from "@cocalc/frontend/compute";

interface Props {
  project_id: string;
  actions: ConfigurationActions;
  settings;
  close?: Function;
}

export default function ComputeServerConfig({
  actions,
  close,
  settings,
  project_id,
}: Props) {
  const [needSave, setNeedSave] = useState<boolean>(false);
  const [nextVal, setNextVal] = useState<any>(settings?.get("compute_server"));

  useEffect(() => {
    setNeedSave(nextVal != settings?.get("compute_server"));
  }, [nextVal, settings]);

  useEffect(() => {
    // needed because of realtime collaboration, multiple frames, modal, etc!
    setNextVal(settings?.get("compute_server"));
  }, [settings]);

  // this selector only make sense when compute servers are enabled
  if (!computeServersEnabled()) {
    return null;
  }

  // because of typescript
  () => {
    console.log({ actions, project_id, close, needSave });
  };

  return (
    <Card
      title={
        <>
          <Icon name={"server"} /> Compute Server
        </>
      }
    >
      <p>
        If enabled, all student projects will have a compute server that is
        configured in the same way as the selected compute server.
      </p>
    </Card>
  );
}
